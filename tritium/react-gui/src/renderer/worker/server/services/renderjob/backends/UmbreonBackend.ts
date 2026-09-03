/**
 * @file worker/server/services/renderjob/backends/UmbreonBackend.ts
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
 *
 * Animation mode reuses that same asynchronous cycle one frame at a time
 * (`beginInProcessAnimFrame`), driving `AnimMgr` with the split
 * `beginFrame()` / `endFrame()` pair rather than the blocking `writeFrame()`.
 */

import * as path from "path";

import type { AnimMgr } from "@cuemol/core/src/wrappers/AnimMgr";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { UmbreonSceneExporter } from "@cuemol/core/src/wrappers/UmbreonSceneExporter";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderSettingsSnapshot } from "@renderer/data/renderResult";
import type { RenderBinaries } from "@renderer/worker/shared/renderTypes";
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

// AO gather resolution (renderBackends.ts "aoGather" enum) -> umbreon aoResDiv.
// -1 gathers once per output pixel and interpolates (the fast path, effective
// only above supersample 1); 0 gathers at every shading hit.
const AO_GATHER: Record<string, number> = {
  "Per output pixel": -1,
  "Per shading hit": 0,
};

// NPR coloring pattern (renderBackends.ts "hatchColoring" enum) -> the
// exporter's hatchBase/hatchInk pair (umbreon --hatch-base / --hatch-ink).
// Empty strings keep the style's own base/ink model.
const HATCH_COLORING: Record<string, { base: string; ink: string }> = {
  "Style default": { base: "", ink: "" },
  "Ink on paper": { base: "paper", ink: "fixed" },
  "Colored ink on paper": { base: "paper", ink: "albedo" },
  "Ink on color fill": { base: "albedo", ink: "fixed" },
  "Colored ink on color fill": { base: "albedo", ink: "albedo" },
};

// Lighting energy balance, in the POV exporter's terms (_light_inten /
// _flash_frac / _amb_frac; the exporter's lightIntensity / flashFraction /
// ambientFraction). lightIntensity and flashFraction come from the Lights
// group and apply to every lighting method; ambientFraction is the GI-only
// share of the energy the gather receives occlusion-aware. Under GI all
// three are owned by the "GI lighting" axis (renderBackends.ts).
//
// DIRECT_LIGHT is that axis' step 0: the direct lights of CueMol's POV
// default (key 0.52, headlight 0.78) plus a gathered ambient (1.55 * 0.16 =
// 0.25) that, through umbreon's diffuse weight (0.8), equals the flat
// material ambient (0.2) of the non-GI render, so GI at step 0 reproduces
// the raytraced picture. Without GI the ambient fraction only dims the
// direct lights (POV without radiosity keeps the unit ambient_light), so it
// is pinned to this value there: the direct lights then stay identical to
// GI step 0 whatever the GI axis was last set to, instead of a hidden value
// darkening the raytrace.
//
// GI_LIGHT is the axis' default step (4): almost no headlight, the energy
// moved into the key light and the gather. It is only the fallback for a
// snapshot that carries no lighting props; the C++ side carries the same
// values as its "auto" for scripts.
// Derivation: docs/architecture/umbreon-gi-lighting-balance.md
const DIRECT_LIGHT = {
  lightIntensity: 1.55,
  flashFraction: 0.6,
  ambientFraction: 0.16,
} as const;
const GI_LIGHT = {
  lightIntensity: 1.2,
  flashFraction: 0.05,
  ambientFraction: 0.4,
} as const;


/**
 * Create the umbreon exporter and apply every setting from `snapshot`.
 *
 * Shared by the still and the animation paths, which differ only in how the
 * camera is chosen: the still path names it (`camera = "__current"`), while an
 * animation frame gets the animation's own camera object from
 * `AnimMgr.beginFrame()` (an explicit camera object overrides the name).
 *
 * @param npr - Umbreon (NPR) backend: write the hatch block instead of the GI
 *   one. The two are exclusive by design -- hatch ink mode discards the shaded
 *   color, so the C++ side skips GI whenever hatching is on, and the NPR
 *   backend's props carry no GI keys to send anyway.
 */
function makeExporter(
  ctx: WorkerContext,
  snapshot: RenderSettingsSnapshot,
  npr: boolean,
): UmbreonSceneExporter {
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

  // Umbreon-specific backend props. Fallbacks preserve the C++ ctor defaults
  // (e.g. aoDistance 1e20 = unbounded) when a prop is absent from the snapshot.
  // Supersampling only: umbreon's adaptive AA is left at its off default,
  // since it is unsupported alongside GI and so is not offered in the UI.
  exporter.supersample = numVal(ub, "supersample", 3);
  // AO on/off is a dedicated switch; map it to aoSamples 0 when off (C++
  // treats 0 samples as AO disabled). When on, aoSamples is >= 1.
  //
  // The rest of the AO block is written ONLY while AO is on. umbreon gates
  // every AO computation on aoSamples > 0, so the values would not change the
  // image either way -- but aoResDiv is read before that gate: the coarse-AO
  // grid cannot be combined with GI, so an out-resolution gather sent
  // alongside GI makes umbreon print
  //   "warning: --ao-res out is not supported with --gi yet"
  // on every GI render. AO and GI are alternatives (the Lighting selector
  // treats them as such), so the AO knobs simply have no business being sent
  // when AO is off. Left unset they keep the C++ ctor's neutral values
  // (aoResDiv 0, recipe flags off).
  const aoEnabled = boolVal(ub, "aoEnabled", false);
  exporter.aoSamples = aoEnabled ? numVal(ub, "aoSamples", 8) : 0;
  if (aoEnabled) {
    // 0 (or less) asks libcuemol2 to scale the radius to the scene bounding box.
    exporter.aoDistance = numVal(ub, "aoDistance", 0);
    exporter.aoIntensity = numVal(ub, "aoIntensity", 1.0);
    // AO quality recipe. aoDiffuseFactor defaults to 1.0 rather than umbreon's
    // 0.0: at 0 the AO term only touches the ambient light, and CueMol's
    // default lighting is mostly direct, so AO would be nearly invisible.
    exporter.aoDiffuseFactor = numVal(ub, "aoDiffuseFactor", 1.0);
    exporter.aoMultiScale = boolVal(ub, "aoMultiScale", true);
    exporter.aoBentNormal = boolVal(ub, "aoBentNormal", true);
    exporter.aoLowDiscrepancy = boolVal(ub, "aoLowDiscrepancy", true);
    exporter.aoResDiv = AO_GATHER[strVal(ub, "aoGather", "Per output pixel")] ?? -1;
  }
  exporter.shadows = boolVal(ub, "shadows", false);
  exporter.shadowSamples = numVal(ub, "shadowSamples", 1);
  exporter.lightRadius = numVal(ub, "lightRadius", 0.0);
  // Energy balance (see DIRECT_LIGHT / GI_LIGHT). The ambient fraction is
  // read only while GI actually renders (the NPR backend never enables it,
  // see below).
  const useGI = !npr && boolVal(ub, "useGI", false);
  const fallback = useGI ? GI_LIGHT : DIRECT_LIGHT;
  exporter.lightIntensity = numVal(ub, "lightIntensity", fallback.lightIntensity);
  exporter.flashFraction = numVal(ub, "flashFraction", fallback.flashFraction);
  exporter.ambientFraction = useGI
    ? numVal(ub, "ambientFraction", fallback.ambientFraction)
    : DIRECT_LIGHT.ambientFraction;
  exporter.creaseLimit = numVal(ub, "creaseLimit", -1.0);
  exporter.edgeRise = numVal(ub, "edgeRise", 0.5);
  // Contact contours between DIFFERENT renderers (umbreon strokeEdges.contact).
  // Off by default, matching umbreon and the GL view: a depth-continuous
  // intersection is surface contact rather than occlusion, so nothing inks
  // there unless this is asked for.
  exporter.contactEdges = boolVal(ub, "contactEdges", false);

  if (npr) {
    // NPR tone hatching. Colors are sent only while their Custom switch is
    // on; an empty string tells the exporter to keep the style's own colors
    // (richardson's warm paper, its per-section ink).
    exporter.hatchEnable = true;
    exporter.hatchStyle = strVal(ub, "hatchStyle", "richardson");
    exporter.hatchDensity = numVal(ub, "hatchDensity", 1.0);
    exporter.hatchWidthScale = numVal(ub, "hatchWidthScale", 1.0);
    const coloring =
      HATCH_COLORING[strVal(ub, "hatchColoring", "Style default")] ??
      HATCH_COLORING["Style default"];
    exporter.hatchBase = coloring.base;
    exporter.hatchInk = coloring.ink;
    exporter.hatchInkColor = boolVal(ub, "hatchCustomInk", false)
      ? strVal(ub, "hatchInkColor", "#000000")
      : "";
    exporter.hatchPaperColor = boolVal(ub, "hatchCustomPaper", false)
      ? strVal(ub, "hatchPaperColor", "#ffffff")
      : "";
    exporter.hatchDefaultEdges = boolVal(ub, "hatchDefaultEdges", true);
    // A hand-edited look (the layer editor). The snapshot carries it only
    // while the look differs from the style's template, so an untouched style
    // renders through the C++ side's own layers and tone, byte-identically.
    if (snapshot.hatch) {
      exporter.hatchLayersSpec = snapshot.hatch.layersSpec;
      exporter.hatchToneSpec = snapshot.hatch.toneSpec;
    }
  } else {
    // Diffuse global illumination (pt1 path-traced integrator).
    exporter.useGI = useGI;
    // The sample count is an enum prop (a dropdown of counts), so it arrives
    // as a string.
    exporter.giSamples = Number(strVal(ub, "giSamples", "32")) || 32;
    // giIntensity / giEnvIntensity are not offered in the UI and stay at the
    // exporter's neutral 1.0 (the energy balance above covers that ground).
    const denoise = DENOISE_MODE[strVal(ub, "denoise", "OIDN")] ?? DENOISE_MODE.OIDN;
    exporter.giDenoise = denoise.giDenoise; // pt1Denoise: OIDN on the indirect buffer
    exporter.denoiser = denoise.denoiser; // full-frame post-pass (0 = None, 1 = a-trous)
    // Gather sky model: uniform white or a camera-up gradient down to the
    // ground color (libcuemol2 keeps the overall brightness constant).
    exporter.giSkyGradient = boolVal(ub, "giSkyGradient", true);
    exporter.giGroundColor = strVal(ub, "giGroundColor", "#666666");
  }

  return exporter;
}

/**
 * Wrap a started umbreon render as an `InProcessRender` handle.
 *
 * @param onFinish - Released alongside the exporter once the render has been
 *   joined, whatever the outcome. The animation path releases the frame back
 *   to `AnimMgr` here; the still path detaches the scene.
 */
function makeHandle(
  exporter: UmbreonSceneExporter,
  onFinish: () => void,
): InProcessRender {
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
      try {
        exporter.endRender();
        return exporter.wasRenderCancelled();
      } finally {
        // The scene stays attached to the exporter until this runs, so it must
        // happen even when endRender() throws.
        onFinish();
      }
    },
    cancel: () => exporter.cancelRender(),
    // umbreon's own diagnostics (fallback warnings, Embree errors, the GI
    // stage timing). The C++ side collects them from the library's log sink;
    // this hands each poll's batch to the render log.
    drainLog: () => exporter.getRenderLog(),
  };
}

/**
 * Build one umbreon-based backend. The plain and the NPR backend share the
 * whole in-process render cycle and differ only in the exporter block
 * `makeExporter` writes (GI vs hatch), so a single factory keeps them from
 * drifting apart.
 */
function createUmbreonBackend(id: string, npr: boolean): RenderBackend {
  return {
    id,

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
      const exporter = makeExporter(ctx, snapshot, npr);
      exporter.camera = "__current";

      exporter.attach(scene);
      try {
        exporter.setPath(outputPath);
        // Build the scene (this call) and start the ray trace on a background
        // C++ thread; returns immediately so the pipeline can poll for
        // progress.
        exporter.beginRender();
      } catch (e) {
        // A failed start must not leave the scene attached: the exporter would
        // keep holding the C++ scene reference until it is garbage-collected.
        exporter.detach();
        throw e;
      }

      return makeHandle(exporter, () => exporter.detach());
    },

    beginInProcessAnimFrame(
      ctx: WorkerContext,
      animMgr: AnimMgr,
      snapshot: RenderSettingsSnapshot,
      outputPath: string,
    ): InProcessRender {
      const exporter = makeExporter(ctx, snapshot, npr);
      exporter.setPath(outputPath);

      // beginFrame() attaches the scene, applies this frame's animation state
      // and hands over the animation's own camera -- so no attach() and no
      // `camera` name here (an explicit camera object wins over the name
      // anyway). The frame stays applied until endFrame(), which is what lets
      // the ray trace run asynchronously in between.
      if (!animMgr.beginFrame(exporter)) {
        throw new Error("the animation has no frame left to render");
      }
      try {
        exporter.beginRender();
      } catch (e) {
        animMgr.endFrame(exporter);
        throw e;
      }

      return makeHandle(exporter, () => animMgr.endFrame(exporter));
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
}

export const umbreonBackend: RenderBackend = createUmbreonBackend("umbreon", false);

/** Umbreon with the NPR tone-hatching pass (ink-drawing output). */
export const umbreonNprBackend: RenderBackend = createUmbreonBackend(
  "umbreon_npr",
  true,
);
