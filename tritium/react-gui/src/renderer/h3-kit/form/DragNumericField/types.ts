/**
 * @file h3-kit/form/DragNumericField/types.ts
 * @description The field's public props and handle, plus the transient state
 * the three interaction hooks keep in refs.
 *
 * `FieldCore` is the part they share. The field is one widget with one mode and
 * one draft, so a drag that ends without moving has to hand over to the editor,
 * an arrow press has to leave edit mode, and a blur has to know a press is
 * running. Those hand-offs are the reason the state sits here rather than
 * inside whichever hook happens to own each gesture.
 */

import type React from 'react';

export interface DragNumericFieldProps {
    value: number;
    /** Continuous: fires every drag frame, every step click, and on text commit. */
    onChange: (value: number) => void;
    /**
     * Commit: fires once at the end of an interaction (drag end, step click,
     * text-edit Enter/blur). Use for a single undo step. Mirrors
     * NumericField.onRelease.
     */
    onRelease?: (value: number) => void;
    /** Lower clamp. Default -Infinity (unbounded). */
    min?: number;
    /** Upper clamp. Default Infinity (unbounded). */
    max?: number;
    /**
     * Normal drag snap granularity and arrow increment. Default 1. The drag
     * also offers a fine snap (`step / 10`, Shift) and coarse snap
     * (`step * 10`, Ctrl); see the file header.
     */
    step?: number;
    /**
     * Fix the drag rate at `step / pxPerStep` value units per pixel instead of
     * deriving it from the range (e.g. 1 = 1 unit / pixel, matching the UXP
     * fakedial wheel). Only for a field whose range is not what the gesture
     * should span -- an unbounded one, or one where a specific feel is part of
     * the port. Does not affect the snap granularity or the arrow increment.
     */
    pxPerStep?: number;
    /**
     * Fine drag snap (Shift). Defaults to `step / 10`. Set explicitly when the
     * fine granularity is not a 10th of `step` (e.g. `step` 0.05, `fineSnap`
     * 0.01). Also drives the stored-value quantization and default display
     * precision (the finest resolution the value can take).
     */
    fineSnap?: number;
    /** Coarse drag snap (Ctrl / Cmd). Defaults to `step * 10`. */
    coarseSnap?: number;
    /** Decimals to display; when omitted, derived from the fine snap (`step / 10`). */
    decimals?: number;
    /** Optional unit suffix, e.g. "deg", "A", "%". Rendered in a non-editable span. */
    unit?: string;
    disabled?: boolean;
    /**
     * Treat a *drag* as a live transaction: preview while dragging and commit
     * once on release. When false (default) a drag writes nothing until it is
     * released. See the file header.
     *
     * This flag gates the drag lifecycle only. An arrow press announces itself
     * either way -- see {@link DragNumericFieldProps.onDragStart}.
     */
    realtime?: boolean;
    /**
     * Fired once at the start of an interaction that will emit several
     * `onChange` values, so the parent can snapshot the value they all step
     * away from and build one undo entry for the whole run.
     *
     * Two interactions qualify, and they are gated differently on purpose:
     *   - a drag, once it crosses the movement threshold -- only when
     *     `realtime`, because a non-realtime drag writes nothing until release;
     *   - an arrow-button press, always, because auto-repeat turns one press
     *     into a run of steps whether or not it previews. Holding the arrow
     *     must still collapse to a single undo entry.
     */
    onDragStart?: () => void;
    /**
     * Fired when a realtime drag is aborted rather than released: Esc (pointer
     * lock lost) mid-drag, or the field unmounting mid-drag. The parent should
     * restore the object to its pre-drag value. Never fires when `realtime` is
     * false.
     */
    onDragCancel?: () => void;
    /**
     * Called after a text edit is committed with Enter or Tab, so the parent
     * can advance focus to the next field in a column (e.g. via the next
     * field's `focusEdit()`). No-op when unset (Tab then falls through to the
     * browser's native focus order). See the file header.
     */
    onCommitNext?: () => void;
    /**
     * Called after a text edit is committed with Shift+Tab, so the parent can
     * move focus to the previous field in a column. No-op when unset.
     */
    onCommitPrev?: () => void;
    /**
     * Display formatter. Defaults to `value.toFixed(decimals)`. Override for a
     * non-decimal presentation (e.g. a timecode); `parse` must then read the
     * same shape back.
     */
    format?: (value: number) => string;
    /**
     * Text-edit parser; return null for malformed input (the edit is then
     * discarded). Defaults to `Number()` with a finite check. Providing it also
     * switches the edit input to `type="text"`.
     */
    parse?: (text: string) => number | null;
    /** Step-affordance layout. Default `sides` (`<` / `>` at the field edges). */
    stepper?: 'sides' | 'stacked';
    /**
     * Step granularity for the arrows and (opt-in) the Up / Down keys, which
     * would otherwise both use `step`. Receives the live text edit -- with
     * `caretPos` null when the whole draft is selected, i.e. there is no
     * meaningful caret -- or null when the field is not being edited, so a
     * unit-segmented field can step the segment under the caret. Supplying it
     * also enables Up / Down stepping while editing.
     */
    resolveStep?: (edit: { text: string; caretPos: number | null } | null) => number;
    /** Accessible name for the widget as a whole. */
    'aria-label'?: string;
    /** Native tooltip on the widget as a whole. */
    title?: string;
    /** Extra class on the root, for a preset's canonical width. */
    className?: string;
}

/** Imperative handle exposed via ref (see `onCommitNext` / `onCommitPrev`). */
export interface DragNumericFieldHandle {
    /** Put the field into text-edit mode with its current value selected. */
    focusEdit(): void;
}

/** Transient drag bookkeeping, read by the global mousemove closure. */
export interface DragState {
    startValue: number;
    accumPx: number;
    crossed: boolean;
    /** Fixed for the drag, so a re-layout mid-gesture cannot change the feel. */
    valuePerPx: number;
}

/** Transient arrow-press bookkeeping for the auto-repeat hold. */
export interface PressState {
    sign: 1 | -1;
    /** Accumulated value during the hold; advanced one `stepSize` per tick. */
    held: number;
    /** Increment per tick -- `step`, or what `resolveStep` returned. */
    stepSize: number;
    /** Initial-delay timeout, then the repeat interval (cleared on release). */
    delayTimer: ReturnType<typeof setTimeout> | null;
    repeatTimer: ReturnType<typeof setInterval> | null;
}

export type Mode = 'idle' | 'hover' | 'dragging' | 'editing';

/**
 * Callbacks and numeric parameters the global (document-level) listeners read.
 *
 * A drag attaches its listeners once at mousedown; a re-render must not have to
 * re-attach them, so they reach current behaviour through this ref rather than
 * through their closure.
 */
export interface DragCallbacks {
    onChange: (v: number) => void;
    onRelease?: (v: number) => void;
    min: number;
    max: number;
    step: number;
    pxPerStep?: number;
    fineStep: number;
    coarseStep: number;
    realtime: boolean;
    onDragStart?: () => void;
    onDragCancel?: () => void;
}

/**
 * The state the three interaction hooks share.
 *
 * The field has one mode and one draft between them: a press that never moves
 * becomes an edit, an arrow press leaves edit mode first, and a blur that
 * arrives because an arrow press stole focus must not commit the draft. Each
 * hook keeps its own gesture bookkeeping (drag / press / key-step) private.
 */
export interface FieldCore {
    mode: Mode;
    setMode: React.Dispatch<React.SetStateAction<Mode>>;
    draft: string;
    setDraft: React.Dispatch<React.SetStateAction<string>>;
    /** The widget as a whole: focus target and pointer-lock element. */
    rootRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLInputElement | null>;
    /** Latest committed value, for closures that must not re-subscribe. */
    valueRef: React.MutableRefObject<number>;
    /** Latest formatter, read the same way and for the same reason. */
    formatRef: React.MutableRefObject<(v: number) => string>;
    cbRef: React.MutableRefObject<DragCallbacks>;
    /** Read a typed draft, or null when it is empty / malformed. */
    parseDraft: (text: string) => number | null;
    format: (v: number) => string;
    disabled: boolean | undefined;
    min: number;
    max: number;
    fineStep: number;
}
