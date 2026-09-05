/**
 * @file worker/shared/calls/render.ts
 * @description ServiceMap slice: external render jobs (POV-Ray / umbreon), their hatch styles,
 * and the render settings a scene stores.
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
import type {
  GetSceneRenderSettingsArgs,
  GetSceneRenderSettingsResult,
  SetSceneRenderSettingsArgs,
  SetSceneRenderSettingsResult,
} from '@renderer/worker/server/services/renderSettings/renderSettings.service'

export interface RenderCalls {
  renderStart:                { args: RenderStartArgs; result: RenderStartResult }
  renderCancel:               { args: RenderCancelArgs; result: RenderCancelResult }
  getHatchStyleSpec:          { args: GetHatchStyleSpecArgs; result: GetHatchStyleSpecResult }
  getSceneRenderSettings:     { args: GetSceneRenderSettingsArgs; result: GetSceneRenderSettingsResult }
  setSceneRenderSettings:     { args: SetSceneRenderSettingsArgs; result: SetSceneRenderSettingsResult }
}

export const RENDER_KEYS = [
  'renderStart',
  'renderCancel',
  'getHatchStyleSpec',
  'getSceneRenderSettings',
  'setSceneRenderSettings',
] as const satisfies readonly (keyof RenderCalls)[]
