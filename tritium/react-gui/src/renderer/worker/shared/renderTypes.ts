/**
 * @file worker/shared/renderTypes.ts
 * @description Types shared by both threads for the render pipeline:
 * the `renderStart` / `renderCancel` service contracts and the
 * worker -> renderer `render-progress` push payload.
 */

import type { RenderSettingsSnapshot } from "../../data/renderResult";

/** Push-channel name for worker -> renderer render updates. */
export const RENDER_PROGRESS_CHANNEL = "render-progress";

/**
 * Paths to the external binaries the render pipeline drives. Configured in
 * the SettingsPane and persisted; a leading `~` is expanded by the worker.
 */
export interface RenderBinaries {
  /** POV-Ray executable. */
  povrayExe: string;
  /** POV-Ray standard include directory. */
  povrayInc: string;
  /** blendpng layer-compositing executable. */
  blendpng: string;
}

/**
 * Last-resort default binary locations, used only when Main resolves no path
 * (APP_PATH defaultRenderBinaries empty) and the user has set none in Settings.
 * The primary dev/packaged resolution lives in main/ipcHandlers.ts
 * getRenderBinaries() (dev: LIBCUEMOL2_ROOT / BUNDLE_APPS env; packaged: install
 * tree). A leading `~` is expanded by the worker. These placeholders assume the
 * standard download_extpkgs / WORKDIR layout.
 */
export const DEFAULT_RENDER_BINARIES: RenderBinaries = {
  povrayExe: "~/tmp/proj64_deplibs/povray/bin/povray",
  povrayInc: "~/tmp/proj64_deplibs/povray/include",
  blendpng: "~/tmp/proj64_deplibs/cuemol2/bin/blendpng",
};

/** Arguments for the `renderStart` worker service. */
export interface RenderStartArgs {
  sceneId: number;
  /** Active view id, captured into the "__current" camera before export. */
  viewId?: number;
  /** Frozen settings used for this render. */
  snapshot: RenderSettingsSnapshot;
  /** External binary paths to use. */
  binaries: RenderBinaries;
}

export interface RenderStartResult {
  ok: boolean;
  jobId: string;
  error?: string;
}

export interface RenderCancelArgs {
  jobId: string;
}

export interface RenderCancelResult {
  ok: boolean;
}

/** Coarse phase of a running render. */
export type RenderUpdatePhase = "exporting" | "running" | "blending";

/**
 * Worker -> renderer push payload (channel `render-progress`).
 * One discriminated union covers progress, completion and failure.
 */
export type RenderUpdate =
  | {
      type: "progress";
      /**
       * Progress of the whole job, 0..100. For a movie that means finished
       * frames plus the current frame's share -- not the current frame alone.
       */
      jobId: string;
      progress: number;
      phase: RenderUpdatePhase;
      /** Movie mode: 0-based index of the frame being rendered. */
      frameIndex?: number;
      /** Movie mode: total number of frames in the job. */
      frameCount?: number;
      /** Movie mode: progress of the current frame alone, 0..100. */
      frameProgress?: number;
      logChunk?: string;
    }
  | {
      /**
       * A finished movie frame, for the live preview. Sent on its own rather
       * than on progress ticks, and rate-limited by the worker, so the image
       * payload never rides along with the frequent progress updates.
       */
      type: "framePreview";
      jobId: string;
      frameIndex: number;
      dataUrl: string;
      width: number;
      height: number;
    }
  | {
      type: "complete";
      jobId: string;
      /** The image, or for a movie the last rendered frame. */
      imageDataUrl: string;
      width: number;
      height: number;
      elapsedSec: number;
      /**
       * Movie mode: where the frame sequence landed. The frames stay on disk
       * and are read back one at a time for the result viewer's frame slider,
       * rather than all being pushed here.
       */
      movie?: { frameCount: number; outputDir: string; baseName: string };
    }
  | {
      type: "error";
      jobId: string;
      error: string;
    };
