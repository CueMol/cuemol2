/**
 * @file worker/shared/animTypes.ts
 * @description Animation timeline DTOs.
 *
 * The worker builds these from the C++ AnimMgr and the renderer only reads
 * them, so they live on the boundary rather than in renderer/types.ts, which
 * `worker/shared/` must not import (see calls/index.ts).
 */

// --- Animation Timeline (Blender-style strip model) ---
//
// CueMol's animation is an ordered list of time-ranged `AnimObj` elements
// owned by the scene's `AnimMgr`; every time value is in milliseconds. Each
// element becomes one horizontal strip on the timeline (left = absStart,
// width = duration). These types are driven 1:1 by the C++ AnimMgr/AnimObj
// API.

/**
 * Concrete `AnimObj` subtype.
 *
 * `AnimObj` exposes no `type` getter, so the worker derives this from the
 * wrapped object's class name (see `helpers/animElementType.ts`).
 * `'unknown'` is the fallback bucket for an unrecognised subtype.
 */
export type AnimElementType =
  | "SimpleSpin"
  | "CamMotion"
  | "ShowHideAnim"
  | "SlideInOutAnim"
  | "MolAnim"
  | "RealPropAnim"
  | "RendXformAnim"
  | "NoopAnimObj"
  | "unknown";

/**
 * Add-menu element type id. Maps to a concrete `AnimObj` subclass worker-side
 * (Show/Hide -> ShowHideAnim, SlideIn/Out -> SlideInOutAnim, each with a `hide`
 * flag); the others map by name. Distinct from `AnimElementType` because the
 * menu splits Show/Hide and SlideIn/Out that share one class.
 */
export type AnimAddType =
  | "SimpleSpin"
  | "CamMotion"
  | "ShowAnim"
  | "HideAnim"
  | "SlideInAnim"
  | "SlideOutAnim"
  | "MolAnim"
  | "NoopAnimObj";

/** Playback state of the animation manager. */
export type AnimPlayState = "stop" | "play" | "pause";

/**
 * Whether an element's time reference chain resolves.
 *
 *   - `ok`: absolute times are known;
 *   - `missing`: its own `timeRefName` names no element;
 *   - `cycle`: it sits on a reference loop (a self-reference is a loop of one);
 *   - `upstream`: it chains to an element in one of the two states above.
 */
export type AnimTimeRefState = "ok" | "missing" | "cycle" | "upstream";

/**
 * One CueMol `AnimObj` rendered as a single timeline strip.
 *
 * All time fields are milliseconds (`TimeValue.millisec`). The strip is
 * drawn from the resolved `absStartMs`..`absEndMs` span; edits (later
 * phases) write the *relative* `startMs`/`endMs` and the worker re-resolves
 * via `AnimMgr.resolveRelTime()`.
 */
export interface AnimElement {
  /** Position in `AnimMgr` (== `getAt` index). Volatile across edits. */
  index: number;

  /** `AnimObj.uid` -- stable identity (React key / selection). */
  uid: number;

  /** `AnimObj.name`. Also the target of another element's `timeRefName`. */
  name: string;

  /** Subtype, derived worker-side from the class name (not a C++ prop). */
  type: AnimElementType;

  /** `AnimObj.disabled` (enabled = `!disabled`). */
  disabled: boolean;

  /** `AnimObj.timeRefName` -- '' = absolute; else chained after that element. */
  timeRefName: string;

  /** Relative start (what edits write). */
  startMs: number;

  /** Relative end. */
  endMs: number;

  /**
   * Resolved absolute start -> strip left edge. Resolved worker-side from the
   * chain when `timeRefState` is `ok`; otherwise the last position C++ held
   * (0 for an element that never resolved), so the strip has somewhere to be.
   */
  absStartMs: number;

  /** Resolved absolute end -> strip right edge (same source as `absStartMs`). */
  absEndMs: number;

  /** `AnimObj.quadric` easing factor (0 = linear). */
  quadric: number;

  /** Whether the element's time reference chain resolves. */
  timeRefState: AnimTimeRefState;

  /** Why it does not, in the words the inspector shows; set when not `ok`. */
  resolveError?: string;
}

/**
 * Manager-level `AnimMgr` snapshot.
 *
 * `elapsedMs` has no change event on the C++ side, so it is polled during
 * playback (later phases) rather than pushed.
 */
export interface AnimMgrState {
  /** Total length (`AnimMgr.length`; auto-grows to `max(absEnd)`). */
  lengthMs: number;

  /** Current play position (`AnimMgr.elapsed`). */
  elapsedMs: number;

  /** Play state, mapped from the `playState` enum. */
  playState: AnimPlayState;

  /** `AnimMgr.loop`. */
  loop: boolean;

  /** `AnimMgr.startcam` (start-camera name; '' when none). */
  startcam: string;
}

/** Full timeline snapshot rendered by `AnimationPanel`. */
export interface AnimTimeline {
  /** Scene this timeline belongs to. */
  sceneId: number;

  /** Index-ordered elements; lane order follows this order. */
  elements: AnimElement[];

  /**
   * Why the chain does not resolve (the first root cause in list order), or
   * absent when every element is `ok`. While set, playback is refused and
   * the panel shows the reason.
   */
  resolveError?: string;

  /** Manager-level state. */
  mgr: AnimMgrState;

  /**
   * Scene camera names (`Scene.getCameraInfoJSON`), for the start-camera
   * selector. The "(none)" entry is added renderer-side, as in UXP's
   * `<camerasel>` widget.
   */
  cameras: string[];

  /**
   * Display-only frames-per-second for the ruler's frame readout and a
   * future render default. Not a C++ property; defaults to 30.
   */
  fps: number;
}

/** Worker -> renderer push channel for playback progress. */
export const ANIM_PROGRESS_CHANNEL = 'anim-progress'

/**
 * Worker -> renderer push payload (channel `anim-progress`).
 *
 * C++ drives playback on its own timer and fires no per-frame event, so the
 * worker samples the manager on the frame loop it already runs and pushes
 * what changed. The renderer used to ask for this ~15 times a second instead.
 */
export interface AnimProgressUpdate {
  sceneId: number
  mgr: AnimMgrState
}
