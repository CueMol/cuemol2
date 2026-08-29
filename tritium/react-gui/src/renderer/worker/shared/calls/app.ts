/**
 * @file worker/shared/calls/app.ts
 * @description ServiceMap slice: application-level queries (build info, log drain, shutdown).
 *
 * One row per registered worker service. `APP_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type { AppInfoResult } from '../../server/services/appInfo.service'
import type { DrainLogMessagesResult } from '../../server/services/drainLogMessages.service'
import type { CancelAllJobsResult } from '../../server/services/shutdown.service'

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
