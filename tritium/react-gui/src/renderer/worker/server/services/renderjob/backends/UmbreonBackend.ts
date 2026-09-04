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
 * The exporter is configured from the scene's render settings (Scene app data
 * "render") by the C++ `UmbreonSceneExporter.applyRenderSettings`, the one
 * mapping this backend shares with cuetty and the Python module; there is no
 * TypeScript copy of it. The Rendering window writes the editor's state into
 * the scene before every render, so the scene is what the editor shows.
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
import type { RenderSettings } from "@cuemol/core/src/wrappers/RenderSettings";
import type { Scene } from "@cuemol/core/src/wrappers/Scene";
import type { UmbreonSceneExporter } from "@cuemol/core/src/wrappers/UmbreonSceneExporter";
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import type { RenderSettingsSnapshot } from "@renderer/data/renderResult";
import type { RenderBinaries } from "@renderer/worker/shared/renderTypes";
import { renderSettingsForRender } from "@renderer/worker/server/services/renderSettings/renderSettings.service";
import {
  type RenderBackend,
  type ExportedScene,
  type InProcessRender,
  type RenderTaskSpec,
} from "./RenderBackend";

/**
 * Create the umbreon exporter and configure it from the scene's render
 * settings.
 *
 * The settings are the scene's stored RenderSettings or, for a scene that
 * holds none, a fresh one at the class defaults -- exactly what the editor
 * showed for that scene, since it starts from those defaults and had nothing
 * to write before the render. A render never creates the settings holder in
 * the scene: it is not an edit. The mapping onto the exporter properties
 * (image size in its unit, AO gating, GI vs hatching, the lighting balance)
 * lives in C++ (`applyRenderSettings`), where cuetty and the Python module
 * use it too.
 *
 * `blockId` names the backend block explicitly ("umbreon" = GI lighting,
 * "umbreon_npr" = hatching): the stored `backend` stays "" until the user
 * picks one, while this backend was chosen by the window.
 *
 * Shared by the still and the animation paths, which differ only in how the
 * camera is chosen: the still path names it (`camera = "__current"`), while an
 * animation frame gets the animation's own camera object from
 * `AnimMgr.beginFrame()` (an explicit camera object overrides the name).
 */
function makeExporter(
  ctx: WorkerContext,
  scene: Scene,
  blockId: string,
): UmbreonSceneExporter {
  const exporter = ctx.strMgr.createHandler("umbreon", 2) as UmbreonSceneExporter;
  if (!exporter) throw new Error("cannot create umbreon exporter");

  // Probe the method: an addon built against an older libcuemol2 lacks it.
  // There is deliberately no fallback (it would be a second copy of the
  // mapping); such a build cannot render with the scene's settings at all.
  const probe = exporter as unknown as { applyRenderSettings?: unknown };
  if (typeof probe.applyRenderSettings !== "function") {
    throw new Error(
      "this build has no applyRenderSettings API; " +
        "rebuild @cuemol/core against the current libcuemol2",
    );
  }

  const settings = renderSettingsForRender(ctx, scene) as unknown as RenderSettings;
  exporter.applyRenderSettings(settings, blockId);
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
 * whole in-process render cycle and differ only in the settings block the
 * exporter is configured from (GI vs hatch), so a single factory keeps them
 * from drifting apart.
 */
function createUmbreonBackend(id: string): RenderBackend {
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

    // The snapshot is not read: the scene holds the settings (see makeExporter).
    beginInProcess(
      ctx: WorkerContext,
      scene: Scene,
      _snapshot: RenderSettingsSnapshot,
      outputPath: string,
    ): InProcessRender {
      const exporter = makeExporter(ctx, scene, id);
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
      scene: Scene,
      animMgr: AnimMgr,
      _snapshot: RenderSettingsSnapshot,
      outputPath: string,
    ): InProcessRender {
      const exporter = makeExporter(ctx, scene, id);
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

export const umbreonBackend: RenderBackend = createUmbreonBackend("umbreon");

/** Umbreon with the NPR tone-hatching pass (ink-drawing output). */
export const umbreonNprBackend: RenderBackend = createUmbreonBackend("umbreon_npr");
