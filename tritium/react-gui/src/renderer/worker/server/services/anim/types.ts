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
import type { PropWriteMode } from "@renderer/worker/shared/genericProps";
import type { Fail, Ok, Result } from "@renderer/worker/shared/result";
// --- detail shapes ---

/** Renderer-side default fps for the ms<->frame ruler readout. */
export const DEFAULT_FPS = 30;

/**
 * Failure of an element-addressed call. `gone` marks the one failure the
 * inspector closes on -- the uid has left the manager; every other failure
 * keeps the element on screen and reports `error`.
 */
export type AnimElementFail = Fail & { gone?: true };

export function goneFail(): AnimElementFail {
  return {
    ok: false,
    error: "animation element no longer exists",
    code: "not-found",
    gone: true,
  };
}

/** The scene or its animation manager did not resolve. */
export function noMgrFail(): Fail {
  return { ok: false, error: "scene or animation manager not found", code: "not-found" };
}

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

/**
 * Result of a transport op: the post-mutation manager snapshot. A refused
 * op (no view, an unresolved chain, a C++ throw) carries the reason instead.
 */
export type AnimTransportResult = Result<{ mgr: AnimMgrState }>;

export interface AnimSetElementTimeArgs {
  sceneId: number;
  /** Stable element identity (a strip index is stale after any edit). */
  uid: number;
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
  uid: number;
}

export interface AnimMoveElementArgs {
  sceneId: number;
  uid: number;
  /**
   * Raw target index (UXP convention: i-1 to move up, i+1 to move down),
   * clamped to the list; a move onto its own position is a no-op.
   */
  to: number;
}

export type AnimEditResult = Ok | AnimElementFail;

/**
 * Add result. The manager snapshot is present on failure too when the add
 * got as far as seeding the `__current` start camera (`ensureStartCam` runs
 * outside the undo transaction and fires no event the renderer could hear).
 */
export type AnimAddResult =
  | Ok<{ uid: number; index: number; mgr: AnimMgrState }>
  | (Fail & { mgr?: AnimMgrState });

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

/**
 * A candidate for the Relative-to dropdown. One entry per distinct name
 * other than the element's own; `usable` is `checkTimeRef` for it (false for
 * a name that would close a cycle, is carried twice, or does not resolve),
 * with `reason` in the words the inspector shows.
 */
export interface AnimElementSibling {
  name: string;
  usable: boolean;
  reason?: string;
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

export type GetAnimElementDetailResult = Ok<{ detail: AnimElementDetail }> | AnimElementFail;

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

/** An element's RELATIVE start / end in ms -- what the `timing` prop writes. */
export interface AnimTimingMs {
  startMs: number;
  endMs: number;
}

export interface SetAnimElementPropArgs {
  sceneId: number;
  uid: number;
  prop: AnimElementPropKey;
  value:
    | string
    | number
    | boolean
    | AnimTimingMs // prop === "timing"
    | { x: number; y: number; z: number }; // prop === "axis"
  /**
   * How the write is recorded (`commit` when omitted). `preview` and `abort`
   * are the realtime-drag modes of `PropWriteMode` and are accepted for
   * `timing` only: a preview writes without an undo transaction, an abort
   * restores `original` without one. A commit that carries `original`
   * restores it first, outside the transaction, so the recorded step is
   * `original -> value` and not `last preview -> value`.
   */
  mode?: PropWriteMode;
  /** Pre-drag timing: required by `abort`, optional for `commit`. */
  original?: AnimTimingMs;
}

/** The refreshed detail rides on success; a `preview` write omits it. */
export type SetAnimElementPropResult = Ok<{ detail?: AnimElementDetail }> | AnimElementFail;

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

export type GetAnimTargetOptionsResult =
  | Ok<{ renderers: AnimRendererOption[]; cameras: AnimCameraOption[]; mols: AnimMolOption[] }>
  | Fail;

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
  /**
   * Realtime-drag protocol, as on `setGenericProp`: `preview` writes without
   * an undo transaction, `abort` restores the pre-drag value (or the default
   * flag when `originalWasDefault`) without one, and a `commit` (default)
   * carrying `originalValue` restores it first so the recorded step spans
   * the whole drag. `set` only; a reset never previews.
   */
  mode?: PropWriteMode;
  originalValue?: string | number | boolean;
  originalWasDefault?: boolean;
}

export interface ResetAnimElementGenericPropsArgs {
  sceneId: number;
  uid: number;
  propNames: string[];
}

/** `entries` is the refreshed list; a preview / abort answers with none. */
export type AnimGenericPropsResult = Ok<{ entries: GenericPropEntry[] }> | AnimElementFail;
