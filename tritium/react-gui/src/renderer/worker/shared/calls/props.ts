/**
 * @file worker/shared/calls/props.ts
 * @description ServiceMap slice: the generic property bridge behind the Inspector.
 *
 * One row per registered worker service. `PROPS_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  GetGenericPropsArgs,
  GetGenericPropsResult,
  ResetGenericPropsArgs,
  SetGenericPropArgs,
  SetGenericPropResult,
  SetGenericPropsArgs,
} from '../../server/services/genericProps.service'

export interface PropsCalls {
  getGenericProps:            { args: GetGenericPropsArgs; result: GetGenericPropsResult }
  setGenericProp:             { args: SetGenericPropArgs; result: SetGenericPropResult }
  setGenericProps:            { args: SetGenericPropsArgs; result: SetGenericPropResult }
  resetGenericProps:          { args: ResetGenericPropsArgs; result: SetGenericPropResult }
}

export const PROPS_KEYS = [
  'getGenericProps',
  'setGenericProp',
  'setGenericProps',
  'resetGenericProps',
] as const satisfies readonly (keyof PropsCalls)[]
