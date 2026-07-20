/**
 * @file hooks/useRenderJob.ts
 * @description Drives a render job from the renderer side.
 *
 * `start()` calls the `renderStart` worker service and then tracks the job
 * via `render-progress` push updates; on completion the rendered image is
 * handed to `onComplete` (which opens a Render Result tab). `cancel()` calls
 * `renderCancel`.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { AsyncCueMol } from "../worker/client/AsyncCueMol";
import type {
  RenderUpdate,
  RenderUpdatePhase,
  RenderStartResult,
  RenderBinaries,
} from "../worker/shared/renderTypes";
import {
  type RenderSource,
  type RenderSettingsSnapshot,
  type RenderResult,
  buildRenderResult,
} from "../data/renderResult";

/** Lifecycle status of a render job. */
export type RenderJobStatus =
  | "exporting"
  | "running"
  | "blending"
  | "done"
  | "error"
  | "cancelled";

/** State of a single render job. */
export interface RenderJob {
  jobId: string;
  /** Progress of the whole job, 0..100 (all frames, for a movie). */
  progress: number;
  status: RenderJobStatus;
  phase: string;
  log: string[];
  startedAt: number;
  finishedAt?: number;
  source?: RenderSource;
  /** Movie mode: 0-based index of the frame being rendered. */
  frameIndex?: number;
  /** Movie mode: total number of frames. */
  frameCount?: number;
  /** Movie mode: progress of the current frame alone, 0..100. */
  frameProgress?: number;
  /** Movie mode: most recently finished frame, shown as a live preview. */
  previewDataUrl?: string;
  /** Pixel size of `previewDataUrl`. */
  previewWidth?: number;
  previewHeight?: number;
}

/** Parameters needed to start a render. */
export interface RenderStartParams {
  sceneId: number;
  viewId?: number;
  snapshot: RenderSettingsSnapshot;
  source: RenderSource;
  /** External binary paths (POV-Ray / blendpng). */
  binaries: RenderBinaries;
}

const ACTIVE_STATUSES: RenderJobStatus[] = ["exporting", "running", "blending"];

/** True (and narrows) while the job is still progressing. */
export function isRenderJobActive(job: RenderJob | null): job is RenderJob {
  return job !== null && ACTIVE_STATUSES.includes(job.status);
}

/** Cap on retained log lines. */
const LOG_CAP = 500;

const appendLog = (log: string[], lines: string[]): string[] => {
  if (lines.length === 0) return log;
  const next = [...log, ...lines];
  return next.length > LOG_CAP ? next.slice(-LOG_CAP) : next;
};

const splitLog = (chunk: string): string[] =>
  chunk.split(/\r?\n/).filter((l) => l.trim().length > 0);

const PHASE_LABELS: Record<RenderUpdatePhase, string> = {
  exporting: "Exporting scene",
  running: "Rendering",
  blending: "Blending layers",
};

export function useRenderJob(opts: {
  /** Worker bridge (null until CueMol is ready). */
  cm: AsyncCueMol | null;
  /** Called with the finished result when a job completes. */
  onComplete: (result: RenderResult) => void;
}) {
  const { cm, onComplete } = opts;
  const [job, setJob] = useState<RenderJob | null>(null);

  // Params of the in-flight job, keyed by the worker-assigned jobId.
  const pendingRef = useRef<{ jobId: string; params: RenderStartParams } | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Subscribe to worker render updates for the active job.
  useEffect(() => {
    if (!cm) return;
    return cm.subscribeRenderProgress((u: RenderUpdate) => {
      const pending = pendingRef.current;
      if (!pending || u.jobId !== pending.jobId) return;

      if (u.type === "progress") {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "running",
                progress: u.progress,
                phase: PHASE_LABELS[u.phase],
                frameIndex: u.frameIndex,
                frameCount: u.frameCount,
                frameProgress: u.frameProgress,
                log: u.logChunk ? appendLog(prev.log, splitLog(u.logChunk)) : prev.log,
              }
            : prev,
        );
      } else if (u.type === "framePreview") {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                previewDataUrl: u.dataUrl,
                previewWidth: u.width,
                previewHeight: u.height,
              }
            : prev,
        );
      } else if (u.type === "complete") {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "done",
                progress: 100,
                phase: "Completed",
                finishedAt: Date.now(),
                log: appendLog(prev.log, ["Render completed"]),
              }
            : prev,
        );
        pendingRef.current = null;
        onCompleteRef.current(
          buildRenderResult({
            imageDataUrl: u.imageDataUrl,
            width: u.width,
            height: u.height,
            elapsedSec: u.elapsedSec,
            source: pending.params.source,
            snapshot: pending.params.snapshot,
            movie: u.movie,
          }),
        );
      } else {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                phase: "Error",
                finishedAt: Date.now(),
                log: appendLog(prev.log, [u.error]),
              }
            : prev,
        );
        pendingRef.current = null;
      }
    });
  }, [cm]);

  const start = useCallback(
    async (params: RenderStartParams) => {
      if (!cm) return;
      setJob({
        jobId: "",
        status: "exporting",
        progress: 0,
        phase: "Exporting scene",
        log: ["Render started"],
        startedAt: Date.now(),
        source: params.source,
      });
      let res: RenderStartResult | undefined;
      try {
        res = await cm.invokeService("renderStart", {
          sceneId: params.sceneId,
          viewId: params.viewId,
          snapshot: params.snapshot,
          binaries: params.binaries,
        });
      } catch (e) {
        setJob((prev) =>
          prev
            ? { ...prev, status: "error", phase: "Error", finishedAt: Date.now(), log: appendLog(prev.log, [String(e)]) }
            : prev,
        );
        return;
      }
      if (res?.ok) {
        pendingRef.current = { jobId: res.jobId, params };
        setJob((prev) => (prev ? { ...prev, jobId: res.jobId } : prev));
      } else {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                phase: "Error",
                finishedAt: Date.now(),
                log: appendLog(prev.log, [res?.error ?? "Render failed to start"]),
              }
            : prev,
        );
      }
    },
    [cm],
  );

  const cancel = useCallback(async () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setJob((prev) =>
      isRenderJobActive(prev)
        ? {
            ...prev,
            status: "cancelled",
            phase: "Cancelled",
            finishedAt: Date.now(),
            log: appendLog(prev.log, ["Render cancelled"]),
          }
        : prev,
    );
    if (cm && pending) {
      try {
        await cm.invokeService("renderCancel", { jobId: pending.jobId });
      } catch {
        /* ignore */
      }
    }
  }, [cm]);

  return { job, start, cancel } as const;
}
