/**
 * @file worker/shared/calls/apbs.ts
 * @description ServiceMap slice: APBS electrostatic potential jobs.
 *
 * One row per registered worker service. `APBS_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  CalcApbsCancelArgs,
  CalcApbsCancelResult,
  CalcApbsStartArgs,
  CalcApbsStartResult,
  ProposeElepotNameArgs,
  ProposeElepotNameResult,
} from '../apbsTypes'

export interface ApbsCalls {
  calcApbsStart:              { args: CalcApbsStartArgs; result: CalcApbsStartResult }
  calcApbsCancel:             { args: CalcApbsCancelArgs; result: CalcApbsCancelResult }
  proposeElepotName:          { args: ProposeElepotNameArgs; result: ProposeElepotNameResult }
}

export const APBS_KEYS = [
  'calcApbsStart',
  'calcApbsCancel',
  'proposeElepotName',
] as const satisfies readonly (keyof ApbsCalls)[]
