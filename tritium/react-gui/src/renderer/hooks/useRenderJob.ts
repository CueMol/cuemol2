/**
 * @file hooks/useRenderJob.ts
 * @description Drives a render job's lifecycle for the BottomPanel Render tab.
 *
 * Phase 2 is mock-only: `start()` runs a timer that walks a fake job through
 * its phases (exporting → running → blending → done) so the panel, progress
 * bar and StatusBar wiring can be verified before the real worker-side
 * pipeline (phase 4) is connected.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { RenderSource } from "../data/renderResult";

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
  /** Unique id of this job. */
  jobId: string;
  /** Current lifecycle status. */
  status: RenderJobStatus;
  /** Completion percentage, 0..100. */
  progress: number;
  /** Human-readable label of the current phase. */
  phase: string;
  /** Accumulated log lines. */
  log: string[];
  /** Epoch ms when the job started. */
  startedAt: number;
  /** Epoch ms when the job ended (done / error / cancelled). */
  finishedAt?: number;
  /** Scene/view the render was started from (captured at start). */
  source?: RenderSource;
}

/** Statuses in which the job is still progressing. */
const ACTIVE_STATUSES: RenderJobStatus[] = ["exporting", "running", "blending"];

/** True (and narrows) while the job is still progressing. */
export function isRenderJobActive(job: RenderJob | null): job is RenderJob {
  return job !== null && ACTIVE_STATUSES.includes(job.status);
}

/** Mock job tick interval and per-tick progress step. */
const TICK_MS = 400;
const PROGRESS_STEP = 7;

/** Advance the mock job by one tick. */
function advanceMockJob(job: RenderJob): RenderJob {
  const progress = Math.min(100, job.progress + PROGRESS_STEP);
  const log = [...job.log];
  let status = job.status;
  let phase = job.phase;

  if (progress >= 100) {
    log.push("Render completed");
    return { ...job, progress, status: "done", phase: "Completed", log, finishedAt: Date.now() };
  }
  if (progress >= 90) {
    if (status !== "blending") {
      status = "blending";
      phase = "Blending layers";
      log.push("Blending layers...");
    }
  } else if (progress >= 15) {
    if (status !== "running") {
      status = "running";
      phase = "Rendering";
      log.push("Rendering scene...");
    }
    log.push(`Rendered ${progress}%`);
  }
  return { ...job, progress, status, phase, log };
}

/**
 * Owns the current render job. `start()` begins a new (mock) job; `cancel()`
 * stops the active one. The job object is the single source of truth read by
 * both the Render panel and the StatusBar.
 */
export function useRenderJob() {
  const [job, setJob] = useState<RenderJob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback((source?: RenderSource) => {
    stopTimer();
    setJob({
      jobId: `render-${Date.now()}`,
      status: "exporting",
      progress: 0,
      phase: "Exporting scene",
      log: ["Render started", "Exporting scene..."],
      startedAt: Date.now(),
      source,
    });
    timerRef.current = setInterval(() => {
      setJob((prev) => {
        if (!isRenderJobActive(prev)) return prev;
        const next = advanceMockJob(prev);
        if (!isRenderJobActive(next)) stopTimer();
        return next;
      });
    }, TICK_MS);
  }, [stopTimer]);

  const cancel = useCallback(() => {
    stopTimer();
    setJob((prev) =>
      isRenderJobActive(prev)
        ? {
            ...prev,
            status: "cancelled",
            phase: "Cancelled",
            log: [...prev.log, "Render cancelled"],
            finishedAt: Date.now(),
          }
        : prev,
    );
  }, [stopTimer]);

  // Stop the timer if the component unmounts mid-job.
  useEffect(() => stopTimer, [stopTimer]);

  return { job, start, cancel } as const;
}
