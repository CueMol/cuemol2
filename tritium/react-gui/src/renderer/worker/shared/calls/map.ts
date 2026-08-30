/**
 * @file worker/shared/calls/map.ts
 * @description ServiceMap slice: the density-map panel.
 *
 * One row per registered worker service. `MAP_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  GetMapRendererStateArgs,
  GetMapRendererStateResult,
  ListMapRenderersArgs,
  ListMapRenderersResult,
  RedrawMapCenterArgs,
  RedrawMapCenterResult,
  SetMapRendererPropArgs,
  SetMapRendererPropResult,
} from '@renderer/worker/server/services/densityMapPanelOps.service'

export interface MapCalls {
  listMapRenderers:           { args: ListMapRenderersArgs; result: ListMapRenderersResult }
  getMapRendererState:        { args: GetMapRendererStateArgs; result: GetMapRendererStateResult }
  setMapRendererProp:         { args: SetMapRendererPropArgs; result: SetMapRendererPropResult }
  redrawMapCenter:            { args: RedrawMapCenterArgs; result: RedrawMapCenterResult }
}

export const MAP_KEYS = [
  'listMapRenderers',
  'getMapRendererState',
  'setMapRendererProp',
  'redrawMapCenter',
] as const satisfies readonly (keyof MapCalls)[]
