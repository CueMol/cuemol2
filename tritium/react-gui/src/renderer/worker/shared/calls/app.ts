/**
 * @file worker/shared/calls/app.ts
 * @description ServiceMap slice: application-level queries (build info, log drain, shutdown).
 *
 * One row per registered worker service. `APP_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type { AppInfoResult } from '@renderer/worker/server/services/app/appInfo'
import type { DrainLogMessagesResult } from '@renderer/worker/server/services/app/drainLogMessages'
import type { CancelAllJobsResult } from '@renderer/worker/server/services/app/shutdown'

export interface AppCalls {
  appInfo:                    { args: Record<string, never>; result: AppInfoResult }
  drainLogMessages:           { args: Record<string, never>; result: DrainLogMessagesResult }
  cancelAllJobs:              { args: Record<string, never>; result: CancelAllJobsResult }
}

export const APP_KEYS = [
  'appInfo',
  'drainLogMessages',
  'cancelAllJobs',
] as const satisfies readonly (keyof AppCalls)[]
