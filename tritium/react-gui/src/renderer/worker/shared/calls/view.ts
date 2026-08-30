/**
 * @file worker/shared/calls/view.ts
 * @description ServiceMap slice: per-view attributes: projection, transform, input params, labels.
 *
 * One row per registered worker service. `VIEW_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  LabelDefaultsResult,
  SetLabelDefaultsArgs,
} from '@renderer/worker/server/services/labelDefaults.service'
import type {
  SetViewInputParamsArgs,
  ViewInputParamsResult,
} from '@renderer/worker/server/services/viewInputParams.service'
import type {
  ViewCenterMarkArgs,
  ViewCenterMarkResult,
  ViewProjectionArgs,
  ViewProjectionResult,
} from '@renderer/worker/server/services/viewProjection.service'
import type {
  GetViewXformArgs,
  RotateViewArgs,
  RotateViewResult,
  SetViewXformArgs,
  SetViewXformResult,
  TranslateViewArgs,
  TranslateViewResult,
  ViewXformResult,
} from '@renderer/worker/server/services/viewXform.service'

export interface ViewCalls {
  getLabelDefaults:           { args: Record<string, never>; result: LabelDefaultsResult }
  setLabelDefaults:           { args: SetLabelDefaultsArgs; result: { ok: boolean } }
  getViewInputParams:         { args: Record<string, never>; result: ViewInputParamsResult }
  setViewInputParams:         { args: SetViewInputParamsArgs; result: { ok: boolean } }
  getViewProjection:          { args: ViewProjectionArgs; result: ViewProjectionResult }
  setViewProjection:          { args: ViewProjectionArgs; result: ViewProjectionResult }
  getViewCenterMark:          { args: ViewCenterMarkArgs; result: ViewCenterMarkResult }
  setViewCenterMark:          { args: ViewCenterMarkArgs; result: ViewCenterMarkResult }
  getViewXform:               { args: GetViewXformArgs; result: ViewXformResult }
  setViewXform:               { args: SetViewXformArgs; result: SetViewXformResult }
  rotateView:                 { args: RotateViewArgs; result: RotateViewResult }
  translateView:              { args: TranslateViewArgs; result: TranslateViewResult }
}

export const VIEW_KEYS = [
  'getLabelDefaults',
  'setLabelDefaults',
  'getViewInputParams',
  'setViewInputParams',
  'getViewProjection',
  'setViewProjection',
  'getViewCenterMark',
  'setViewCenterMark',
  'getViewXform',
  'setViewXform',
  'rotateView',
  'translateView',
] as const satisfies readonly (keyof ViewCalls)[]
