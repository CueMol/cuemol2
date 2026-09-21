/**
 * @file worker/server/services/bench.service.ts
 * @description The `--bench` entry point: run one measured cell.
 *
 * Only ever called by a process started with `--bench`; a normal session
 * never reaches it, and the counters it switches on stay dormant until it
 * does. Lives on the `bench/perf-harness` branch and is not part of a
 * release.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { runBench, type RunBenchArgs } from '@renderer/worker/server/bench/runBench';
import type { BenchResult } from '@renderer/worker/server/bench/types';
import type { Result } from '@renderer/worker/shared/result';

export type BenchRunArgs = RunBenchArgs;
export type BenchRunResult = Result<{ result: BenchResult }>;

function benchRun(ctx: WorkerContext, args: BenchRunArgs): Promise<BenchRunResult> {
    return runBench(ctx, args);
}

export const services = { benchRun };
