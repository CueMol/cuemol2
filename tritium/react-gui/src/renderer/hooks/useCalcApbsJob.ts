/**
 * @file hooks/useCalcApbsJob.ts
 * @description Drives an APBS potential-calculation job from the renderer side.
 *
 * `start()` calls the `calcApbsStart` worker service and tracks the job via
 * `apbs-progress` push updates; on completion the new ElePotMap object id is
 * handed to `onComplete`. `cancel()` calls `calcApbsCancel`. Mirrors
 * `useRenderJob` (the render pipeline's renderer-side driver).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { AsyncCueMol } from '../worker/client/AsyncCueMol';
import type {
  ApbsUpdate,
  ApbsUpdatePhase,
  CalcApbsStartArgs,
  CalcApbsStartResult,
} from '../worker/shared/apbsTypes';

/** Lifecycle status of an APBS job. */
export type ApbsJobStatus = 'running' | 'done' | 'error' | 'cancelled';

/** Result handed to `onComplete`. */
export interface ApbsJobResult {
  newObjId: number;
  newObjName: string;
}

/** State of a single APBS job. */
export interface ApbsJob {
  status: ApbsJobStatus;
  /** Current phase (pdb2pqr / apbs), or undefined before the first update. */
  phase?: ApbsUpdatePhase;
  /** Human-readable status line for the dialog. */
  statusText: string;
  /** Accumulated log lines (process stdout + status). */
  log: string[];
  /** Populated on the error path. */
  error?: string;
}

/** True while the job is still progressing. */
export function isApbsJobActive(job: ApbsJob | null): job is ApbsJob {
  return job !== null && job.status === 'running';
}

/** Cap on retained log lines. */
const LOG_CAP = 500;

function appendLog(log: string[], lines: string[]): string[] {
  if (lines.length === 0) return log;
  const next = [...log, ...lines];
  return next.length > LOG_CAP ? next.slice(-LOG_CAP) : next;
}

function splitLog(chunk: string): string[] {
  return chunk.split(/\r?\n/).filter((l) => l.trim().length > 0);
}

export function useCalcApbsJob(opts: {
  /** Worker bridge (null until CueMol is ready). */
  cm: AsyncCueMol | null;
  /** Called with the finished result when a job completes. */
  onComplete: (result: ApbsJobResult) => void;
}) {
  const { cm, onComplete } = opts;
  const [job, setJob] = useState<ApbsJob | null>(null);

  const pendingRef = useRef<{ jobId: string } | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Subscribe to worker APBS updates for the active job.
  useEffect(() => {
    if (!cm) return;
    return cm.subscribeApbsProgress((u: ApbsUpdate) => {
      const pending = pendingRef.current;
      if (!pending || u.jobId !== pending.jobId) return;

      if (u.type === 'progress') {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'running',
                phase: u.phase,
                statusText: u.status,
                log: u.logChunk ? appendLog(prev.log, splitLog(u.logChunk)) : prev.log,
              }
            : prev,
        );
      } else if (u.type === 'complete') {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'done',
                statusText: 'Completed',
                log: appendLog(prev.log, ['APBS calculation: done']),
              }
            : prev,
        );
        pendingRef.current = null;
        onCompleteRef.current({ newObjId: u.newObjId, newObjName: u.newObjName });
      } else {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'error',
                statusText: 'Error',
                error: u.error,
                log: appendLog(prev.log, [u.error]),
              }
            : prev,
        );
        pendingRef.current = null;
      }
    });
  }, [cm]);

  const start = useCallback(
    async (args: CalcApbsStartArgs) => {
      if (!cm) return;
      setJob({
        status: 'running',
        statusText: 'Starting...',
        log: ['APBS calculation started'],
      });
      let res: CalcApbsStartResult | undefined;
      try {
        res = await cm.invokeService('calcApbsStart', args);
      } catch (e) {
        setJob((prev) =>
          prev ? { ...prev, status: 'error', statusText: 'Error', error: String(e) } : prev,
        );
        return;
      }
      if (res?.ok) {
        pendingRef.current = { jobId: res.jobId };
      } else {
        const msg = res?.error ?? 'Failed to start APBS calculation';
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'error',
                statusText: 'Error',
                error: msg,
                log: appendLog(prev.log, [msg]),
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
      isApbsJobActive(prev)
        ? { ...prev, status: 'cancelled', statusText: 'Cancelled' }
        : prev,
    );
    if (cm && pending) {
      try {
        await cm.invokeService('calcApbsCancel', { jobId: pending.jobId });
      } catch {
        /* ignore */
      }
    }
  }, [cm]);

  /** Clear job state (called when the dialog reopens). */
  const reset = useCallback(() => {
    pendingRef.current = null;
    setJob(null);
  }, []);

  return { job, start, cancel, reset } as const;
}
