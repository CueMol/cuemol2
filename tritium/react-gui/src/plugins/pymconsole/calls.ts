/**
 * @file plugins/pymconsole/calls.ts
 * @description The PyM console's renderer-to-worker call contract.
 *
 * The same `{ args; result }` shape a `ServiceMap` slice has, kept here
 * because a plugin cannot add rows to that closed map. `PYMCONSOLE_KEYS`
 * mirrors the keys as a value so `plugins/index.test.ts` can check the
 * contract against the services the worker actually registers.
 */

import { definePluginServices } from '@renderer/plugin-host/api'
import type {
  CompleteArgs,
  CompleteResult,
  RunCommandArgs,
  RunCommandResult,
} from './shared/consoleTypes'

// `type`, not `interface`: the plugin service client needs the implicit index
// signature an interface does not have.
export type PymConsoleCalls = {
  runCommand: { args: RunCommandArgs; result: RunCommandResult }
  complete: { args: CompleteArgs; result: CompleteResult }
}

export const PYMCONSOLE_KEYS = [
  'runCommand',
  'complete',
] as const satisfies readonly (keyof PymConsoleCalls)[]

/** Typed caller for the services this plugin registers. */
export const pymServices = definePluginServices<PymConsoleCalls>('pymconsole')
