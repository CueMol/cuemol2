/**
 * @file worker/shared/calls/render.ts
 * @description ServiceMap slice: external render jobs (POV-Ray / umbreon) and their hatch styles.
 *
 * One row per registered worker service. `RENDER_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  GetHatchStyleSpecArgs,
  GetHatchStyleSpecResult,
} from '@renderer/worker/server/services/renderjob/hatchStyleSpec'
import type {
  RenderCancelArgs,
  RenderCancelResult,
  RenderStartArgs,
  RenderStartResult,
} from '@renderer/worker/shared/renderTypes'

export interface RenderCalls {
  renderStart:                { args: RenderStartArgs; result: RenderStartResult }
  renderCancel:               { args: RenderCancelArgs; result: RenderCancelResult }
  getHatchStyleSpec:          { args: GetHatchStyleSpecArgs; result: GetHatchStyleSpecResult }
}

export const RENDER_KEYS = [
  'renderStart',
  'renderCancel',
  'getHatchStyleSpec',
] as const satisfies readonly (keyof RenderCalls)[]
