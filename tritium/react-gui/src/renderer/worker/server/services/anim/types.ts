/**
 * @file worker/server/services/anim/types.ts
 * @description Argument and result shapes for the animation services.
 *
 * The renderer imports these through the barrel: the Animation panel and the
 * element inspector are typed against exactly what the worker returns.
 */
import type { AnimAddType, AnimMgrState } from "@renderer/types";
import type { AnimElementType } from "@renderer/types";
import { type GenericPropEntry } from "@renderer/worker/server/services/helpers/parseGenericProps";
// --- detail shapes ---

/** Renderer-side default fps for the ms<->frame ruler readout. */
export const DEFAULT_FPS = 30;

export interface AnimListTimelineArgs {
  sceneId: number;
}

export interface AnimGetMgrStateArgs {
  sceneId: number;
}

export interface AnimPlayArgs {
  sceneId: number;
  /** Target view the animation drives (start/goTime require a View). */
  viewId: number;
}

export interface AnimPauseArgs {
  sceneId: number;
}

export interface AnimStopArgs {
  sceneId: number;
}

export interface AnimGoTimeArgs {
  sceneId: number;
  viewId: number;
  /** Seek target in milliseconds (clamped to >= 0). */
  ms: number;
}

export interface AnimSetLoopArgs {
  sceneId: number;
  loop: boolean;
}

export interface AnimSetStartCamArgs {
  sceneId: number;
  /** Scene camera name applied before playback; '' = none (use the view camera). */
  startcam: string;
}

/** Result of a transport op: the post-mutation manager snapshot. */
export interface AnimTransportResult {
  ok: boolean;
  mgr: AnimMgrState;
}

export interface AnimSetElementTimeArgs {
  sceneId: number;
  index: number;
  /** RELATIVE start/end in ms (what AnimObj stores; abs is derived). */
  startMs: number;
  endMs: number;
}

export interface AnimAddElementArgs {
  sceneId: number;
  type: AnimAddType;
  /** Insert before this index; append when omitted or >= size. */
  insertIndex?: number;
  /**
   * Active view, used to seed the `__current` start camera (UXP parity).
   * Omitted when no view is active -- the start camera is then left alone.
   */
  viewId?: number;
}

export interface AnimRemoveElementArgs {
  sceneId: number;
  index: number;
}

export interface AnimMoveElementArgs {
  sceneId: number;
  from: number;
  /** Raw target index (UXP convention: i-1 to move up, i+1 to move down). */
  to: number;
}

export interface AnimEditResult {
  ok: boolean;
}

export interface AnimAddResult {
  ok: boolean;
  uid?: number;
  index?: number;
  /**
   * Post-add manager snapshot. An add can adopt the `__current` start camera
   * (see `ensureStartCam`), and that change fires no event the renderer could
   * listen for, so it is handed back the way the transport ops do.
   */
  mgr?: AnimMgrState;
}

/** Common fields shared by every element (volatile index is intentionally omitted). */
export interface AnimElementCommon {
  uid: number;
  name: string;
  type: AnimElementType;
  disabled: boolean;
  timeRefName: string; // '' = (absolute)
  startMs: number; // RELATIVE
  endMs: number; // RELATIVE
  quadric: number; // raw real (renderer maps to/from 0..50%)
}

/** Only the inspected subtype's props are populated; the rest are undefined. */
export interface AnimElementTypeProps {
  angle?: number;
  axisX?: number;
  axisY?: number;
  axisZ?: number; // SimpleSpin
  endcam?: string;
  ignorerotate?: boolean;
  ignorecenter?: boolean;
  ignorezoom?: boolean;
  ignoreslab?: boolean; // CamMotion
  rend?: string; // ShowHideAnim / SlideInOutAnim
  hide?: boolean;
  fade?: boolean;
  tgtAlpha?: number; // ShowHideAnim
  direction?: number;
  distance?: number; // SlideInOutAnim
  mol?: string;
  startValue?: number;
  endValue?: number; // MolAnim
}

/** Other element's name, for the Relative-to dropdown. */
export interface AnimElementSibling {
  name: string;
}

export interface AnimElementDetail {
  common: AnimElementCommon;
  typeProps: AnimElementTypeProps;
  siblings: AnimElementSibling[];
}

export interface GetAnimElementDetailArgs {
  sceneId: number;
  uid: number;
}

export interface GetAnimElementDetailResult {
  ok: boolean;
  /** true = uid no longer in the manager (deleted). The inspector clears on this. */
  gone?: boolean;
  detail?: AnimElementDetail;
}

/** Prop keys the inspector can write. `timing` and `axis` carry object values. */
export type AnimElementPropKey =
  | "name"
  | "disabled"
  | "quadric"
  | "timeRefName"
  | "timing"
  | "angle"
  | "axis"
  | "endcam"
  | "ignorerotate"
  | "ignorecenter"
  | "ignorezoom"
  | "ignoreslab"
  | "rend"
  | "hide"
  | "fade"
  | "tgtAlpha"
  | "direction"
  | "distance"
  | "mol"
  | "startValue"
  | "endValue";

export interface SetAnimElementPropArgs {
  sceneId: number;
  uid: number;
  prop: AnimElementPropKey;
  value:
    | string
    | number
    | boolean
    | { startMs: number; endMs: number } // prop === "timing"
    | { x: number; y: number; z: number }; // prop === "axis"
}

export interface SetAnimElementPropResult {
  ok: boolean;
  gone?: boolean;
  detail?: AnimElementDetail;
}

export interface GetAnimTargetOptionsArgs {
  sceneId: number;
}

export interface AnimRendererOption {
  name: string;
  objName: string;
  type: string;
}
export interface AnimCameraOption {
  name: string;
}
export interface AnimMolOption {
  name: string;
}

export interface GetAnimTargetOptionsResult {
  ok: boolean;
  renderers: AnimRendererOption[];
  cameras: AnimCameraOption[];
  mols: AnimMolOption[];
}

export interface GetAnimElementGenericPropsArgs {
  sceneId: number;
  uid: number;
}

export interface SetAnimElementGenericPropArgs {
  sceneId: number;
  uid: number;
  propName: string;
  op: "set" | "reset";
  valueType: string;
  value?: string | number | boolean;
}

export interface ResetAnimElementGenericPropsArgs {
  sceneId: number;
  uid: number;
  propNames: string[];
}

export interface AnimGenericPropsResult {
  ok: boolean;
  gone?: boolean;
  entries: GenericPropEntry[];
}
