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

/** Push an APBS update to the renderer. */
export function emit(ctx: WorkerContext, update: ApbsUpdate): void {
  ctx.svc.pushMessage(APBS_PROGRESS_CHANNEL, update);
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
