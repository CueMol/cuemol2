/**
 * @file plugins/console/calls.ts
 * @description The console's renderer-to-worker call contract.
 *
 * The same `{ args; result }` shape a `ServiceMap` slice has, kept here
 * because a plugin cannot add rows to that closed map. `CONSOLE_KEYS`
 * mirrors the keys as a value so `plugins/index.test.ts` can check the
 * contract against the services the worker actually registers.
 */

import { definePluginServices } from '@renderer/plugin-host/api'
import type { Result } from '@renderer/worker/shared/result'
import type {
  CancelRunArgs,
  CompleteArgs,
  CompleteResult,
  RunCommandArgs,
  RunCommandResult,
} from './shared/consoleTypes'

// `type`, not `interface`: the plugin service client needs the implicit index
// signature an interface does not have.
export type ConsoleCalls = {
  runCommand: { args: RunCommandArgs; result: RunCommandResult }
  cancelRun: { args: CancelRunArgs; result: Result }
  complete: { args: CompleteArgs; result: CompleteResult }
}

export const CONSOLE_KEYS = [
  'runCommand',
  'cancelRun',
  'complete',
] as const satisfies readonly (keyof ConsoleCalls)[]

/** Typed caller for the services this plugin registers. */
export const consoleServices = definePluginServices<ConsoleCalls>('console')
