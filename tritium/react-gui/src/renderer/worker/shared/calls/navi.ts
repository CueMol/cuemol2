/**
 * @file worker/shared/calls/navi.ts
 * @description ServiceMap slice: the 3D viewport: hit tests, context-menu actions, measure, bond edit.
 *
 * One row per registered worker service. `NAVI_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  BondEditListBondsArgs,
  BondEditListBondsResult,
  BondEditPickArgs,
  BondEditPickResult,
  BondEditRemoveBondArgs,
  BondEditRemoveBondResult,
  BondEditResetArgs,
  BondEditResetResult,
} from '@renderer/worker/server/services/bondEdit.service'
import type {
  MeasureListTargetsArgs,
  MeasureListTargetsResult,
  MeasurePickArgs,
  MeasurePickResult,
  MeasureResetArgs,
  MeasureResetResult,
} from '@renderer/worker/server/services/measure.service'
import type {
  NaviCenterAtArgs,
  NaviCenterAtSymmArgs,
  NaviCtxAroundArgs,
  NaviCtxObjArgs,
  NaviCtxSelectArgs,
} from '@renderer/worker/server/services/naviCtxtMenu.service'
import type {
  NaviClickAtomArgs,
  NaviClickAtomResult,
  NaviHitTestArgs,
  NaviHitTestResult,
  NaviResidSelArgs,
  NaviResidSelResult,
} from '@renderer/worker/server/services/naviTool.service'

export interface NaviCalls {
  naviHitTest:                { args: NaviHitTestArgs; result: NaviHitTestResult }
  naviClickAtom:              { args: NaviClickAtomArgs; result: NaviClickAtomResult }
  naviResidSel:               { args: NaviResidSelArgs; result: NaviResidSelResult }
  measurePick:                { args: MeasurePickArgs; result: MeasurePickResult }
  measureReset:               { args: MeasureResetArgs; result: MeasureResetResult }
  measureListTargets:         { args: MeasureListTargetsArgs; result: MeasureListTargetsResult }
  bondEditPick:               { args: BondEditPickArgs; result: BondEditPickResult }
  bondEditReset:              { args: BondEditResetArgs; result: BondEditResetResult }
  bondEditListBonds:          { args: BondEditListBondsArgs; result: BondEditListBondsResult }
  bondEditRemoveBond:         { args: BondEditRemoveBondArgs; result: BondEditRemoveBondResult }
  naviCenterAt:               { args: NaviCenterAtArgs; result: { ok: boolean } }
  naviCenterAtSymm:           { args: NaviCenterAtSymmArgs; result: { ok: boolean } }
  naviCtxSelect:              { args: NaviCtxSelectArgs; result: { ok: boolean } }
  naviCtxAddSelect:           { args: NaviCtxSelectArgs; result: { ok: boolean } }
  naviCtxUnselect:            { args: NaviCtxObjArgs; result: { ok: boolean } }
  naviCtxInvertSel:           { args: NaviCtxObjArgs; result: { ok: boolean } }
  naviCtxToggleSidechain:     { args: NaviCtxObjArgs; result: { ok: boolean } }
  naviCtxAround:              { args: NaviCtxAroundArgs; result: { ok: boolean } }
}

export const NAVI_KEYS = [
  'naviHitTest',
  'naviClickAtom',
  'naviResidSel',
  'measurePick',
  'measureReset',
  'measureListTargets',
  'bondEditPick',
  'bondEditReset',
  'bondEditListBonds',
  'bondEditRemoveBond',
  'naviCenterAt',
  'naviCenterAtSymm',
  'naviCtxSelect',
  'naviCtxAddSelect',
  'naviCtxUnselect',
  'naviCtxInvertSel',
  'naviCtxToggleSidechain',
  'naviCtxAround',
] as const satisfies readonly (keyof NaviCalls)[]
