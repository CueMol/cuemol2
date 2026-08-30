/**
 * @file worker/server/services/shutdown.service.ts
 * @description Worker-side cleanup the renderer runs before the window closes.
 *
 * Long-running jobs (POV-Ray renders, the ffmpeg encode of a movie, apbs /
 * pdb2pqr) do not run inside the worker: they are external processes started
 * through the C++ ProcessManager and watched by a poll timer. posix_spawn
 * children are ordinary children, so they survive the app -- quitting mid-job
 * left them running, burning CPU and writing into a work directory nothing
 * would ever reclaim (the directory is only registered for cleanup once the
 * job completes).
 *
 * Each job type already knows how to stop itself properly -- kill the tasks,
 * stop the timer, restore whatever an animation overwrote, remove the work
 * directory. Nothing was calling that on the way out.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { cancelAllRenderJobs } from './renderjob/renderJob.service';
import { cancelAllApbsJobs } from './calcApbsPot.service';

export interface CancelAllJobsResult {
    ok: true;
    /** Jobs cancelled, by kind -- logged by the caller, useful in tests. */
    render: number;
    apbs: number;
}

/**
 * Stop every in-flight job so nothing outlives the app.
 *
 * Safe to call when nothing is running: it reports zeroes.
 */
function cancelAllJobs(ctx: WorkerContext): CancelAllJobsResult {
    return {
        ok: true,
        render: cancelAllRenderJobs(ctx),
        apbs: cancelAllApbsJobs(ctx),
    };
}

export const services = { cancelAllJobs };
