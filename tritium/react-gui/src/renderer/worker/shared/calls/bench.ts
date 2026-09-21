/**
 * @file worker/shared/calls/bench.ts
 * @description ServiceMap slice: the `--bench` harness.
 *
 * One row, on its own branch. The harness is not merged into develop, so this
 * slice exists to keep `calls/index.test.ts` -- which asserts the map and the
 * worker's registrations match one for one -- passing while it is checked out.
 */

import type {
    BenchRunArgs,
    BenchRunResult,
} from '@renderer/worker/server/services/bench.service'

export interface BenchCalls {
    benchRun: { args: BenchRunArgs; result: BenchRunResult }
}

export const BENCH_KEYS = ['benchRun'] as const satisfies readonly (keyof BenchCalls)[]
