/**
 * @file worker/server/services/apbs/jobs.ts
 * @description The in-flight jobs, and the teardown every exit path shares.
 *
 * Job ids come from a counter rather than a timestamp: two jobs started in
 * the same millisecond would otherwise collide, and the loser's poll timer
 * would run forever.
 */
import * as fs from 'fs';
import type { ProcessManager } from '@cuemol/core/src/wrappers/ProcessManager';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { APBS_PROGRESS_CHANNEL, type ApbsUpdate } from '@renderer/worker/shared/apbsTypes';
import type { ApbsJobEntry } from './types';
export const jobs = new Map<string, ApbsJobEntry>();
let jobSeq = 0;

/** Monotonic job id. Never a timestamp: two jobs can start in one millisecond. */
export function nextJobId(): string {
  jobSeq += 1;
  return `apbs-${jobSeq}`;
}

type ApbsEnd = Extract<ApbsUpdate, { type: 'complete' | 'error' }>;

/** Jobs a caller in the worker is waiting on, and how they ended. */
const awaited = new Set<string>();
const outcomes = new Map<string, ApbsEnd>();

/** Push an APBS update to the renderer, and keep the end of an awaited job. */
export function emit(ctx: WorkerContext, update: ApbsUpdate): void {
  if (update.type !== 'progress' && awaited.has(update.jobId)) outcomes.set(update.jobId, update);
  ctx.svc.pushMessage(APBS_PROGRESS_CHANNEL, update);
}

const WAIT_POLL_MS = 200;

/**
 * Wait for a job to end, for a caller in the worker (a console command)
 * rather than the dialog, which follows the pushed updates instead. Calls
 * `cancel` once when `cancelled` turns true; a job that disappears without an
 * outcome was cancelled.
 */
export function waitForApbsJob(
  jobId: string,
  cancelled: () => boolean,
  cancel: () => void,
): Promise<ApbsEnd> {
  awaited.add(jobId);
  let asked = false;
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const done = outcomes.get(jobId);
      if (done || !jobs.has(jobId)) {
        clearInterval(timer);
        awaited.delete(jobId);
        outcomes.delete(jobId);
        resolve(done ?? { type: 'error', jobId, error: 'The APBS calculation was cancelled.' });
        return;
      }
      if (!asked && cancelled()) {
        asked = true;
        cancel();
      }
    }, WAIT_POLL_MS);
  });
}

/** Remove a working directory, ignoring errors. */
export function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function stopTimer(entry: ApbsJobEntry): void {
  if (entry.timer !== null) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
}

/** Tear down a job and emit a failure. */
export function failJob(ctx: WorkerContext, entry: ApbsJobEntry, error: string): void {
  stopTimer(entry);
  jobs.delete(entry.jobId);
  if (entry.taskId >= 0) {
    try {
      (ctx.svc.getService('ProcessManager') as ProcessManager).kill(entry.taskId);
    } catch {
      /* ignore */
    }
  }
  cleanupDir(entry.workDir);
  emit(ctx, { type: 'error', jobId: entry.jobId, error });
}
