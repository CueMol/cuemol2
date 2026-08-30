/**
 * @file worker/shared/calls/anim.ts
 * @description ServiceMap slice: the animation manager, its timeline and element properties.
 *
 * One row per registered worker service. `ANIM_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type { AnimMgrState, AnimTimeline } from '@renderer/worker/shared/animTypes'
import type {
  AnimGenericPropsResult,
  GetAnimElementDetailArgs,
  GetAnimElementDetailResult,
  GetAnimElementGenericPropsArgs,
  GetAnimTargetOptionsArgs,
  GetAnimTargetOptionsResult,
  ResetAnimElementGenericPropsArgs,
  SetAnimElementGenericPropArgs,
  SetAnimElementPropArgs,
  SetAnimElementPropResult,
} from '@renderer/worker/server/services/animDetail.service'
import type {
  AnimAddElementArgs,
  AnimAddResult,
  AnimEditResult,
  AnimGetMgrStateArgs,
  AnimGoTimeArgs,
  AnimListTimelineArgs,
  AnimMoveElementArgs,
  AnimPauseArgs,
  AnimPlayArgs,
  AnimRemoveElementArgs,
  AnimSetElementTimeArgs,
  AnimSetLoopArgs,
  AnimSetStartCamArgs,
  AnimStopArgs,
  AnimTransportResult,
} from '@renderer/worker/server/services/animation.service'

export interface AnimCalls {
  animListTimeline:           { args: AnimListTimelineArgs; result: AnimTimeline }
  animGetMgrState:            { args: AnimGetMgrStateArgs; result: AnimMgrState }
  animPlay:                   { args: AnimPlayArgs; result: AnimTransportResult }
  animPause:                  { args: AnimPauseArgs; result: AnimTransportResult }
  animStop:                   { args: AnimStopArgs; result: AnimTransportResult }
  animGoTime:                 { args: AnimGoTimeArgs; result: AnimTransportResult }
  animSetLoop:                { args: AnimSetLoopArgs; result: AnimTransportResult }
  animSetStartCam:            { args: AnimSetStartCamArgs; result: AnimTransportResult }
  animSetElementTime:         { args: AnimSetElementTimeArgs; result: AnimEditResult }
  animAddElement:             { args: AnimAddElementArgs; result: AnimAddResult }
  animRemoveElement:          { args: AnimRemoveElementArgs; result: AnimEditResult }
  animMoveElement:            { args: AnimMoveElementArgs; result: AnimEditResult }
  getAnimElementDetail:       { args: GetAnimElementDetailArgs; result: GetAnimElementDetailResult }
  setAnimElementProp:         { args: SetAnimElementPropArgs; result: SetAnimElementPropResult }
  getAnimTargetOptions:       { args: GetAnimTargetOptionsArgs; result: GetAnimTargetOptionsResult }
  getAnimElementGenericProps: { args: GetAnimElementGenericPropsArgs; result: AnimGenericPropsResult }
  setAnimElementGenericProp:  { args: SetAnimElementGenericPropArgs; result: AnimGenericPropsResult }
  resetAnimElementGenericProps: { args: ResetAnimElementGenericPropsArgs; result: AnimGenericPropsResult }
}

export const ANIM_KEYS = [
  'animListTimeline',
  'animGetMgrState',
  'animPlay',
  'animPause',
  'animStop',
  'animGoTime',
  'animSetLoop',
  'animSetStartCam',
  'animSetElementTime',
  'animAddElement',
  'animRemoveElement',
  'animMoveElement',
  'getAnimElementDetail',
  'setAnimElementProp',
  'getAnimTargetOptions',
  'getAnimElementGenericProps',
  'setAnimElementGenericProp',
  'resetAnimElementGenericProps',
] as const satisfies readonly (keyof AnimCalls)[]
