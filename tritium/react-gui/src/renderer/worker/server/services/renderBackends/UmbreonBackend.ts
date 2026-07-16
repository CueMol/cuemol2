/**
 * @file worker/server/services/renderBackends/UmbreonBackend.ts
 * @description Umbreon (Embree) rendering backend -- an IN-PROCESS ray tracer.
 *
 * Unlike POV-Ray (which exports a .pov/.inc pair and spawns povray + blendpng),
 * the umbreon C++ exporter renders the scene in-process and writes the final
 * PNG itself. So this backend implements the optional `beginInProcess` hook
 * instead of `buildTasks`: the render-job pipeline drives it directly and never
 * queues a ProcessManager task.
 *
 * The render runs ASYNCHRONOUSLY: `beginRender()` builds the scene (on the
 * worker thread) and kicks the ray trace onto a background C++ thread, returning
 * at once. The returned handle exposes lock-free progress / phase / done reads
 * and cooperative cancellation, so the render-job pipeline can poll it between
 * worker ticks -- the worker (and the main-window 3D view) stays responsive and
 * a live progress bar is driven. `finish()` joins the worker and writes the PNG.
 */

import * as path from "path";

import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { UmbreonSceneExporter } from "@cuemol/core/src/wrappers/UmbreonSceneExporter";
import type { WorkerContext } from "../../types/WorkerContext";
import type { RenderSettingsSnapshot } from "../../../../data/renderResult";
import type { RenderBinaries } from "../../../shared/renderTypes";
import {
  type RenderBackend,
  type ExportedScene,
  type InProcessRender,
  type RenderTaskSpec,
  numVal,
  strVal,
  boolVal,
  pixelImageSize,
} from "./RenderBackend";

// GI denoise method (renderBackends.ts "denoise" enum) -> the two umbreon
// exporter knobs. OIDN denoises the pre-composite indirect buffer (giDenoise ->
// pt1Denoise); A-trous runs the full-frame post-pass denoiser (denoiser = 1);
// None turns both off.
const DENOISE_MODE: Record<string, { giDenoise: boolean; denoiser: number }> = {
  OIDN: { giDenoise: true, denoiser: 0 },
  "A-trous": { giDenoise: false, denoiser: 1 },
  None: { giDenoise: false, denoiser: 0 },
};

export const umbreonBackend: RenderBackend = {
  id: "umbreon",

  // No input file to write: umbreon renders straight to the output PNG in
  // `beginInProcess`. Carry only the workdir so `outputImagePath` can derive
  // the target path (the shared `exportScene -> outputImagePath` convention).
  exportScene(_ctx, _scene, _snapshot, workDir): ExportedScene {
    return { inputPath: "", workDir, blendTable: {} };
  },

  outputImagePath(exported: ExportedScene): string {
    return path.join(exported.workDir, "render.png");
  },

  beginInProcess(
    ctx: WorkerContext,
    scene: Scene,
    snapshot: RenderSettingsSnapshot,
    outputPath: string,
  ): InProcessRender {
    const exporter = ctx.strMgr.createHandler("umbreon", 2) as UmbreonSceneExporter;
    if (!exporter) throw new Error("cannot create umbreon exporter");

    const common = snapshot.commonProps;
    const ub = snapshot.backendProps;

    // Reused common props (same mapping as PovrayBackend.exportScene).
    exporter.perspective = strVal(common, "projection", "perspective") === "perspective";
    exporter.useClipZ = boolVal(common, "clipPlane", true);
    exporter.showEdgeLines = boolVal(common, "edgeLines", true);
    exporter.transparentBackground = boolVal(common, "transparentBg", false);
    const { width, height } = pixelImageSize(common);
    exporter.width = width;
    exporter.height = height;
    exporter.camera = "__current";

    // Umbreon-specific backend props. Fallbacks preserve the C++ ctor defaults
    // (e.g. aoDistance 1e20 = unbounded) when a prop is absent from the snapshot.
    exporter.supersample = numVal(ub, "supersample", 3);
    exporter.aoSamples = numVal(ub, "aoSamples", 0);
    exporter.aoDistance = numVal(ub, "aoDistance", 1e20);
    exporter.aoIntensity = numVal(ub, "aoIntensity", 1.0);
    exporter.shadows = boolVal(ub, "shadows", false);
    exporter.shadowSamples = numVal(ub, "shadowSamples", 1);
    exporter.lightRadius = numVal(ub, "lightRadius", 0.0);
    exporter.creaseLimit = numVal(ub, "creaseLimit", -1.0);
    exporter.edgeRise = numVal(ub, "edgeRise", 0.5);

    // Diffuse global illumination (pt1 path-traced integrator).
    exporter.useGI = boolVal(ub, "useGI", false);
    exporter.giSamples = numVal(ub, "giSamples", 32);
    exporter.giIntensity = numVal(ub, "giIntensity", 1.0);
    exporter.giEnvIntensity = numVal(ub, "giEnvIntensity", 1.0);
    const denoise = DENOISE_MODE[strVal(ub, "denoise", "OIDN")] ?? DENOISE_MODE.OIDN;
    exporter.giDenoise = denoise.giDenoise; // pt1Denoise: OIDN on the indirect buffer
    exporter.denoiser = denoise.denoiser; // full-frame post-pass (0 = None, 1 = a-trous)

    exporter.attach(scene);
    exporter.setPath(outputPath);
    // Build the scene (this call) and start the ray trace on a background C++
    // thread; returns immediately so the pipeline can poll for progress.
    exporter.beginRender();

    let finished = false;
    return {
      progress: () => exporter.getRenderProgress(), // 0..1
      phase: () => exporter.getRenderPhaseName(),
      isDone: () => exporter.isRenderDone(),
      finish: () => {
        // endRender joins the worker and writes the PNG (unless cancelled).
        // Guard against a double finish (poll tick racing a forced finish).
        if (finished) return exporter.wasRenderCancelled();
        finished = true;
        exporter.endRender();
        const cancelled = exporter.wasRenderCancelled();
        exporter.detach();
        return cancelled;
      },
      cancel: () => exporter.cancelRender(),
    };
  },

  // Never invoked for an in-process backend (renderJob branches on
  // `beginInProcess` before touching these); defensive stubs.
  buildTasks(_exported, _snapshot, _binaries: RenderBinaries): RenderTaskSpec[] {
    throw new Error("umbreon renders in-process; buildTasks is unused");
  },

  parseProgress(_stdout: string): number | null {
    return null;
  },
};
