/**
 * @file worker/shared/calls/actions.ts
 * @description ServiceMap slice: the action log (what each undo step ran).
 *
 * One row per registered worker service. `ACTIONS_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  ExportActionStepsArgs,
  GetActionStepsArgs,
} from '@renderer/worker/server/services/actions/actions'
import type { ActionStepsArgs, ActionStepView } from '@renderer/worker/shared/actionTypes'
import type { Result } from '@renderer/worker/shared/result'

export interface ActionsCalls {
  getActionSteps:             { args: GetActionStepsArgs; result: Result<{ steps: ActionStepView[] }> }
  exportActionSteps:          { args: ExportActionStepsArgs; result: Result<{ count: number }> }
  actionStepLines:            { args: ActionStepsArgs; result: Result<{ text: string }> }
}

export const ACTIONS_KEYS = [
  'getActionSteps',
  'exportActionSteps',
  'actionStepLines',
] as const satisfies readonly (keyof ActionsCalls)[]
