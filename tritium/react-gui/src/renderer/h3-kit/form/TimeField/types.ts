/**
 * @file h3-kit/form/TimeField/types.ts
 * @description The field's public props, plus the state and refs its
 * interaction hooks share.
 *
 * The field is one widget with one active segment, one mode and one run in
 * flight, so a press that never moves has to become a selection, a stepper
 * press has to leave the expression editor, and a blur has to close whatever
 * run is open. Those hand-offs are why the state sits here rather than inside
 * whichever hook owns each gesture.
 */

import type React from 'react';
import type { TimeUnit } from './timeMath';

export interface TimeFieldProps {
    /** Time in milliseconds. Controlled: the field shows exactly this value. */
    value: number;
    /**
     * Continuous: fires every drag frame, every key / stepper / wheel step,
     * every typed digit, and on an expression commit. The parent must feed
     * the value back through `value`.
     */
    onChange: (ms: number) => void;
    /**
     * Commit: fires exactly once at the end of every interaction -- drag
     * release, key hold release, stepper release, a completed digit buffer,
     * a wheel notch, an expression commit -- even when the value did not
     * change. One call = one undo step.
     */
    onRelease?: (ms: number) => void;
    /**
     * Fired once at the start of an interaction that will emit a run of
     * `onChange` values, so the parent can snapshot the value they all step
     * away from and build one undo entry for the run. A drag announces only
     * when `realtime` (a plain drag writes nothing until release); a key hold,
     * a digit buffer and a stepper press announce always, because each is a
     * run whether or not it previews. Single-shot steps (wheel notch,
     * Backspace, expression commit) do not announce: they are one `onChange`
     * followed by `onRelease`.
     */
    onDragStart?: () => void;
    /**
     * Fired when a started run is abandoned instead of released: Esc (pointer
     * lock lost, or Esc on a key / digit run) or the field unmounting mid-run.
     * Fires whether or not `realtime` is set -- a plain run still moved the
     * displayed value, so the parent has a draft to drop even when it has no
     * preview to roll back. (`DragNumericField`'s prop doc says otherwise; its
     * implementation, and this field, fire it in both modes.)
     */
    onDragCancel?: () => void;
    /**
     * Treat a drag as a live transaction: preview while dragging and commit
     * once on release. When false (default) a drag writes nothing until it is
     * released. Gates the drag's `onDragStart` only; see that prop.
     */
    realtime?: boolean;
    /** Lower clamp in ms. Default 0. */
    min?: number;
    /** Upper clamp in ms. Default unbounded. */
    max?: number;
    disabled?: boolean;
    /** Accessible name for the widget as a whole. */
    'aria-label'?: string;
    /** Native tooltip on the widget as a whole. Defaults to the typing hint. */
    title?: string;
    /** Extra class on the root. */
    className?: string;
}

/** What kind of interaction a run belongs to. */
export type RunKind = 'drag' | 'keys' | 'digits' | 'press';

export type Mode = 'idle' | 'dragging' | 'editing';

/**
 * Callbacks and bounds the document-level listeners and timers read. They are
 * attached once and must keep reaching current behaviour, so they go through
 * this ref rather than through their closures.
 */
export interface TimeCallbacks {
    onChange: (ms: number) => void;
    onRelease?: (ms: number) => void;
    onDragStart?: () => void;
    onDragCancel?: () => void;
    min: number;
    max: number;
    realtime: boolean;
}

/**
 * The one run in flight. Every gesture goes through it, which is what makes
 * "one interaction = one `onRelease`" hold across gestures: beginning a run
 * while another is open releases the old one first, and nothing can emit an
 * `onChange` after `end()` / `cancel()`.
 */
export interface TimeRun {
    /**
     * Start a run. `announce` fires `onDragStart`. `startMs` overrides the
     * starting value (the held value of a run being replaced, else the
     * committed value).
     */
    begin: (kind: RunKind, announce: boolean, startMs?: number) => void;
    /** Move the run to `nextMs` (clamped); a no-op when nothing changes. */
    update: (nextMs: number) => void;
    /** Release the run: one `onRelease` with the held value. */
    end: () => void;
    /** Abandon the run: one `onDragCancel`, nothing released. */
    cancel: () => void;
    /** Kind of the open run, or null. */
    active: () => RunKind | null;
    /** The run's current value, or the committed value when no run is open. */
    held: () => number;
}

/** The state the interaction hooks share. */
export interface TimeCore {
    /** The widget as a whole: focus target and pointer-lock element. */
    rootRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    /** Rendered segment elements by unit, for hit-testing a press. */
    segRefs: React.MutableRefObject<Map<TimeUnit, HTMLSpanElement>>;
    /** Latest committed value, for closures that must not re-subscribe. */
    valueRef: React.MutableRefObject<number>;
    cbRef: React.MutableRefObject<TimeCallbacks>;
    /** Segment the keys, stepper and Ctrl+wheel act on. */
    activeUnit: TimeUnit;
    activeUnitRef: React.MutableRefObject<TimeUnit>;
    setActiveUnit: (unit: TimeUnit) => void;
    /** Segments currently shown (hours appear at one hour). */
    units: ReadonlyArray<TimeUnit>;
    mode: Mode;
    modeRef: React.MutableRefObject<Mode>;
    setMode: React.Dispatch<React.SetStateAction<Mode>>;
    draft: string;
    setDraft: React.Dispatch<React.SetStateAction<string>>;
    disabled: boolean;
    run: TimeRun;
}
