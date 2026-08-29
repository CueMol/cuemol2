/**
 * @file h3-kit/form/DragNumericField.tsx
 * @description Blender-style numeric "number button": a compact field whose
 * body is dragged horizontally to change the value, single-clicked to text-edit,
 * and stepped by always-visible `<` / `>` affordances at the field edges (kept
 * visible, unlike Blender's hover-only arrows, so the field is distinguishable
 * from a plain text box).
 *
 * Drag uses the Pointer Lock API: once a press crosses a small movement
 * threshold the field requests pointer lock, so the OS cursor disappears and
 * `mousemove` keeps delivering `movementX` past the screen edges -- the value
 * can be changed without bound regardless of screen width (the only visual
 * feedback is the field's own number, mirroring Blender). Pointer lock is a
 * progressive enhancement: when `requestPointerLock` is unavailable (e.g. jsdom
 * under test) the same `movementX` accumulation still drives the value.
 *
 * `step` is a SNAP granularity (the value is forced to a multiple of it during
 * a drag), not an increment. Modifiers change the active snap:
 *   - no modifier -> snap to `step`        (normal)
 *   - Shift       -> snap to the fine snap   (default `step / 10`)
 *   - Ctrl / Cmd  -> snap to the coarse snap (default `step * 10`)
 * The fine / coarse snaps default to `step / 10` and `step * 10` but can be set
 * explicitly via `fineSnap` / `coarseSnap` when the desired granularity is not a
 * 10th / 10x of `step` (e.g. step 0.05 with a fine snap of 0.01).
 * The drag sensitivity is derived from the field's own range and width:
 * sweeping across three quarters of the widget takes the value from `min` to
 * `max`. The same gesture therefore spans the same PROPORTION of the range
 * whatever the numbers are, which is what keeps a 0-1 opacity and a 0-100
 * percentage equally controllable -- with a fixed value-per-pixel rate one of
 * them always ends up either impossible to nudge or impossible to sweep. A
 * field with no finite range, or an explicit `pxPerStep`, keeps the fixed
 * `step / pxPerStep` rate instead. Only the snap granularity
 * changes with a modifier, so Shift gives finer resolution rather than slower
 * motion. The `<` / `>` arrows, by contrast, increment / decrement by `step`
 * (independent of the drag rate), and auto-repeat while held down (one immediate
 * step, then -- after a short delay -- a steady stream of steps until release).
 * Pressing an arrow while text-editing leaves edit mode and steps relative to
 * the typed draft (or the current value when nothing valid was typed).
 *
 * The widget is focusable as a single unit (`tabIndex=0` on the root); its
 * parts (arrows, edit input) never take a separate focus ring. Keyboard
 * interaction on the focused widget is intentionally not implemented (Blender's
 * number button has no key-input focus); the edit input handles Enter / Escape,
 * plus Up / Down when `resolveStep` opts the field into keyboard stepping.
 *
 * Non-decimal values (`format` / `parse` / `resolveStep`): the display string,
 * the text-edit parser and the step granularity are all overridable, so the same
 * interaction model can drive a non-plain-number field -- e.g. the `TimeField`
 * preset, which shows `M:SS.mmm` and steps the segment under the caret. When
 * `parse` is given the edit input switches from `type="number"` to `type="text"`
 * (a timecode is not a valid number-input value).
 *
 * The step affordance is laid out either at the field's sides (`stepper="sides"`,
 * the default `<` / `>`) or stacked at its right edge (`stepper="stacked"`, an
 * up / down pair -- the spin-button shape used by time and other unit-segmented
 * values).
 *
 * Sizing/spacing/colors come entirely from `.h3-form-drag*` in `styles/_form-kit.css`
 * (driven by the `--field-*` / `--space-*` / color tokens); no size prop is
 * exposed. The widget is controlled: the displayed value is always the `value`
 * prop, so a parent must update it from `onChange`.
 *
 * When both `min` and `max` are finite (and `max > min`), the value's fraction
 * of the range is painted as a translucent-accent fill bar behind the text
 * (Blender number-button slider look), so the value's position is visible at a
 * glance. The bar is hidden while text-editing.
 *
 * Commit timing mirrors NumericField: `onChange` fires continuously (every drag
 * frame, every step tick during an arrow press, on text commit) for a live
 * draft; `onRelease` fires once at the end of an interaction (drag end, arrow
 * press release, Enter/blur) so the parent can push a single undo step. An
 * entire arrow press -- including a long auto-repeat hold -- is one interaction
 * and therefore one undo step, exactly like a drag.
 *
 * Both a drag and an arrow press drive the same lifecycle, so the realtime hooks
 * below cover holds as well as drags.
 *
 * Realtime mode (`realtime`): for props that benefit from live object feedback,
 * the field also emits `onDragStart` when a drag / arrow press begins and
 * `onDragCancel` if it is aborted (Esc mid-drag, or unmount mid-interaction).
 * This lets a parent run a preview-while-interacting / single-commit-on-release
 * lifecycle (apply the value to the object every `onChange` without undo, then
 * commit one undo step on `onRelease`, or roll back on `onDragCancel`). Without
 * `realtime` (the default), no live preview fires: a hold only updates the
 * displayed number and the object is written once on `onRelease`.
 *
 * Keyboard field-to-field entry (opt-in): a parent that lays several fields out
 * in a column can wire `onCommitNext` / `onCommitPrev` to advance focus on
 * commit -- Enter and Tab call `onCommitNext`, Shift+Tab calls `onCommitPrev`
 * (each after committing the edit). Combined with the imperative `focusEdit()`
 * handle (exposed via ref), the next field can be put straight into edit mode
 * with its value selected, so x/y/z-style triples can be typed in sequence
 * without reaching for the mouse. All three are no-ops when unset.
 *
 * @module form/DragNumericField
 */

import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { AppIcon } from '../../components/AppIcon';
import { clampAndQuantize, decimalsOf, snapTo } from './numericMath';

void React; // classic JSX runtime (vitest)

/** Pixels of horizontal travel before a press becomes a drag (vs a click). */
const DRAG_THRESHOLD_PX = 4;
/**
 * Pixels of horizontal travel that move the raw value by one normal `step`,
 * for a field whose range cannot be swept (see `dragValuePerPx`). Settable
 * per-field via the `pxPerStep` prop (smaller = more sensitive; e.g. 1
 * reproduces the UXP fakedial wheel's 1 unit / pixel).
 */
const PX_PER_STEP = 8;
/**
 * Fraction of the field's width a drag crosses to span its whole range. Less
 * than 1 so the sweep is comfortably inside the widget rather than needing the
 * full width exactly.
 */
const RANGE_DRAG_FRACTION = 0.75;

/**
 * Value units per pixel of horizontal drag.
 *
 * A field with a finite range maps that range onto a fraction of its own
 * width, so the gesture is proportional to the range rather than to the
 * numbers in it. Falls back to the fixed `step / pxPerStep` rate when there is
 * no range to map (an unbounded field) or no width to map it onto (before
 * layout, and under jsdom). An explicit `pxPerStep` opts out: the caller has
 * said what the rate should be.
 */
function dragValuePerPx(
    min: number,
    max: number,
    step: number,
    pxPerStep: number | undefined,
    widthPx: number,
): number {
    if (pxPerStep === undefined) {
        const range = max - min;
        const travel = widthPx * RANGE_DRAG_FRACTION;
        if (Number.isFinite(range) && range > 0 && travel > 0) return range / travel;
    }
    return step / (pxPerStep ?? PX_PER_STEP);
}
/** Factor between the normal snap and the fine (Shift) / coarse (Ctrl) snaps. */
const SNAP_FACTOR = 10;
/** Delay before a held arrow starts auto-repeating (after the first step). */
const STEP_REPEAT_DELAY_MS = 400;
/** Interval between auto-repeat steps while an arrow is held. */
const STEP_REPEAT_INTERVAL_MS = 60;

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
interface DragState {
    startValue: number;
    accumPx: number;
    crossed: boolean;
    /** Fixed for the drag, so a re-layout mid-gesture cannot change the feel. */
    valuePerPx: number;
}

/** Transient arrow-press bookkeeping for the auto-repeat hold. */
interface PressState {
    sign: 1 | -1;
    /** Accumulated value during the hold; advanced one `stepSize` per tick. */
    held: number;
    /** Increment per tick -- `step`, or what `resolveStep` returned. */
    stepSize: number;
    /** Initial-delay timeout, then the repeat interval (cleared on release). */
    delayTimer: ReturnType<typeof setTimeout> | null;
    repeatTimer: ReturnType<typeof setInterval> | null;
}

type Mode = 'idle' | 'hover' | 'dragging' | 'editing';

/**
 * Caret offset inside the edit input, or null when the whole draft is selected
 * (click-to-edit selects everything, so there is no segment to act on).
 */
function caretPosOf(input: HTMLInputElement | null, draft: string): number | null {
    if (!input) return null;
    const start = input.selectionStart;
    if (start === null) return null;
    if (start === 0 && input.selectionEnd === draft.length) return null;
    return start;
}

/**
 * Blender-style draggable numeric field. See the file header for the drag /
 * click / step interaction model and commit timing.
 */
export const DragNumericField = forwardRef<DragNumericFieldHandle, DragNumericFieldProps>(({
    value,
    onChange,
    onRelease,
    min = -Infinity,
    max = Infinity,
    step = 1,
    pxPerStep,
    fineSnap,
    coarseSnap,
    decimals,
    unit,
    disabled,
    realtime = false,
    onDragStart,
    onDragCancel,
    onCommitNext,
    onCommitPrev,
    format: formatProp,
    parse,
    stepper = 'sides',
    resolveStep,
    'aria-label': ariaLabel,
    title,
    className,
}, ref) => {
    const [mode, setMode] = useState<Mode>('idle');
    const [draft, setDraft] = useState('');

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const pressRef = useRef<PressState | null>(null);
    // Value accumulated by a held Up / Down key, committed once on key release.
    const keyStepRef = useRef<number | null>(null);
    // Selection to restore after a key step rewrites the draft: a caret offset,
    // or 'all' to keep the whole draft selected (so a repeat keeps reading as
    // "no caret" and stays on the default step instead of drifting to the
    // segment that happens to sit at offset 0).
    const caretRef = useRef<number | 'all' | null>(null);

    // Finest resolution the value can take (the Shift snap); drives both
    // storage quantization and the default display precision. The coarse snap
    // (Ctrl / Cmd) is the largest. Both default to a 10th / 10x of `step`.
    const fineStep = fineSnap ?? step / SNAP_FACTOR;
    const coarseStep = coarseSnap ?? step * SNAP_FACTOR;
    const dispDecimals = decimals ?? decimalsOf(fineStep);
    const format = useCallback(
        (v: number) => (formatProp ? formatProp(v) : v.toFixed(dispDecimals)),
        [formatProp, dispDecimals],
    );

    /** Read a typed draft, or null when it is empty / malformed. */
    const parseDraft = useCallback(
        (text: string): number | null => {
            if (parse) return parse(text);
            const n = Number(text);
            return text.trim() !== '' && Number.isFinite(n) ? n : null;
        },
        [parse],
    );

    // The global mousemove closure must see the latest committed value (for the
    // onRelease commit) without re-subscribing the listener.
    const valueRef = useRef(value);
    valueRef.current = value;

    // The global mouseup closure reads the formatter through a ref so that a
    // changing `format` (e.g. when the active unit's decimal places change)
    // does NOT recreate `handleMouseUp`. If it did, the reference-stable
    // `teardown` would keep removing a stale `handleMouseUp` and leak the
    // document mouseup listener -- a later stray mouseup would then re-enter
    // edit mode and swallow clicks meant for other widgets.
    const formatRef = useRef(format);
    formatRef.current = format;

    // Stable refs to props the global listeners use, so the listeners attached
    // once at mousedown always reach current behavior.
    const cbRef = useRef({ onChange, onRelease, min, max, step, pxPerStep, fineStep, coarseStep, realtime, onDragStart, onDragCancel });
    cbRef.current = { onChange, onRelease, min, max, step, pxPerStep, fineStep, coarseStep, realtime, onDragStart, onDragCancel };

    // Imperative handle: a parent can drop a sibling field straight into edit
    // mode (value selected) to chain x/y/z-style entry. See the file header.
    useImperativeHandle(
        ref,
        () => ({
            focusEdit: () => {
                if (disabled) return;
                setDraft(format(valueRef.current));
                setMode('editing');
            },
        }),
        [disabled, format],
    );

    // --- Drag (global listeners + pointer lock) ---

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const { onChange, min, max, fineStep, coarseStep, step } = cbRef.current;

        d.accumPx += e.movementX;

        if (!d.crossed) {
            if (Math.abs(d.accumPx) <= DRAG_THRESHOLD_PX) return;
            d.crossed = true;
            setMode('dragging');
            // Realtime: announce the drag start before the first onChange so
            // the parent can snapshot the pre-drag value for a single commit.
            if (cbRef.current.realtime) cbRef.current.onDragStart?.();
            // Hide the OS cursor + unbind from screen edges (best-effort).
            const locked = rootRef.current?.requestPointerLock?.() as
                | Promise<void>
                | void;
            if (locked && typeof locked.catch === 'function') locked.catch(() => {});
        }

        // The rate was fixed when the drag started; the modifier only changes
        // the snap granularity, so the raw value moves at the same rate but is
        // forced to a finer / coarser multiple.
        const raw = d.startValue + d.accumPx * d.valuePerPx;
        const snap = e.shiftKey
            ? fineStep
            : e.ctrlKey || e.metaKey
              ? coarseStep
              : step;
        const next = clampAndQuantize(snapTo(raw, snap), min, max, fineStep);
        onChange(next);
    }, []);

    // Forward declaration so handleMouseUp can remove itself + handleMouseMove.
    const teardown = useCallback(() => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('pointerlockchange', handlePointerLockChange);
        document.body.style.userSelect = '';
        if (document.pointerLockElement === rootRef.current) {
            document.exitPointerLock?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleMouseMove]);

    const handleMouseUp = useCallback(() => {
        const d = dragRef.current;
        dragRef.current = null;
        teardown();
        // No active press for this field -> a stray / leaked mouseup; do not
        // fall through to the edit-mode branch below (which would re-open the
        // field whenever another widget is clicked).
        if (!d) return;
        if (d.crossed) {
            // Drag end -> single commit of the latest value.
            cbRef.current.onRelease?.(valueRef.current);
            setMode('hover');
        } else {
            // Press without crossing the threshold -> treat as a click: edit.
            setDraft(formatRef.current(valueRef.current));
            setMode('editing');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teardown]);

    // If pointer lock is lost mid-drag (e.g. user pressed Esc): in realtime mode
    // treat it as a cancel (roll back the live preview); otherwise end the drag
    // cleanly as if released (commit the current value).
    const handlePointerLockChange = useCallback(() => {
        if (dragRef.current?.crossed && document.pointerLockElement !== rootRef.current) {
            if (cbRef.current.realtime) {
                dragRef.current = null;
                teardown();
                setMode('hover');
                cbRef.current.onDragCancel?.();
            } else {
                handleMouseUp();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleMouseUp, teardown]);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (disabled || mode === 'editing' || e.button !== 0) return;
            e.preventDefault();
            // Focus the widget as a whole (preventDefault above suppresses the
            // implicit focus, so do it explicitly).
            rootRef.current?.focus();
            const c = cbRef.current;
            dragRef.current = {
                startValue: value,
                accumPx: 0,
                crossed: false,
                valuePerPx: dragValuePerPx(
                    c.min,
                    c.max,
                    c.step,
                    c.pxPerStep,
                    rootRef.current?.getBoundingClientRect().width ?? 0,
                ),
            };
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('pointerlockchange', handlePointerLockChange);
        },
        [disabled, mode, value, handleMouseMove, handleMouseUp, handlePointerLockChange],
    );

    // --- Step arrows (press-and-hold auto-repeat) ---

    // Advance the held value by one `step`; stop repeating (but keep the press,
    // so the value still commits on release) once a bound is reached. Reads the
    // live accumulator + cbRef so the interval closure never goes stale.
    const pressStep = useCallback(() => {
        const p = pressRef.current;
        if (!p) return;
        const { min, max, fineStep, onChange } = cbRef.current;
        const next = clampAndQuantize(p.held + p.sign * p.stepSize, min, max, fineStep);
        if (next === p.held) {
            if (p.repeatTimer !== null) {
                clearInterval(p.repeatTimer);
                p.repeatTimer = null;
            }
            if (p.delayTimer !== null) {
                clearTimeout(p.delayTimer);
                p.delayTimer = null;
            }
            return;
        }
        p.held = next;
        onChange(next);
    }, []);

    // End an arrow press: clear timers, drop the global listener, and commit the
    // whole press as a single undo step (mirrors a drag's onRelease).
    const endPress = useCallback(() => {
        const p = pressRef.current;
        if (!p) return;
        pressRef.current = null;
        if (p.delayTimer !== null) clearTimeout(p.delayTimer);
        if (p.repeatTimer !== null) clearInterval(p.repeatTimer);
        document.removeEventListener('mouseup', endPress);
        cbRef.current.onRelease?.(p.held);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Begin an arrow press: take one immediate step, then -- after a short delay
    // -- start a steady auto-repeat that runs until the button is released.
    // `baseValue` overrides the starting value (used when stepping out of
    // text-edit mode, where the step is relative to the typed draft).
    const startPress = useCallback(
        (sign: 1 | -1, baseValue?: number, stepSize?: number) => {
            if (disabled) return;
            const p: PressState = {
                sign,
                held: baseValue ?? valueRef.current,
                stepSize: stepSize ?? cbRef.current.step,
                delayTimer: null,
                repeatTimer: null,
            };
            // Set the press before any focus change: leaving edit mode below
            // moves focus to the root, blurring the input and firing
            // commitEdit, which bails out when a press is active (so the press
            // commits the stepped value instead of the draft).
            pressRef.current = p;
            // A press started from text-edit mode leaves editing first; the
            // caller passes the typed draft (when valid) as baseValue.
            if (mode === 'editing') setMode('hover');
            rootRef.current?.focus();
            // Announce the interaction start before the first onChange so the
            // parent can snapshot the pre-step value for a single undo step.
            cbRef.current.onDragStart?.();
            document.addEventListener('mouseup', endPress);
            pressStep();
            p.delayTimer = setTimeout(() => {
                p.delayTimer = null;
                if (pressRef.current !== p) return;
                p.repeatTimer = setInterval(pressStep, STEP_REPEAT_INTERVAL_MS);
            }, STEP_REPEAT_DELAY_MS);
        },
        [disabled, mode, pressStep, endPress],
    );

    // Mousedown on a step arrow. From text-edit mode it leaves editing and
    // steps from the typed draft (when a valid number) or else the current
    // value; from idle / hover it steps the current value. preventDefault keeps
    // focus on the whole widget (not the arrow) and lets us move focus
    // explicitly; stopPropagation keeps the root's body-drag handler from firing.
    const handleStepButtonDown = useCallback(
        (e: React.MouseEvent, sign: 1 | -1) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (mode === 'editing') {
                // Read the caret BEFORE leaving edit mode -- a segmented field
                // steps whatever segment the caret sits in (UXP timeedit parity).
                const stepSize = resolveStep?.({
                    text: draft,
                    caretPos: caretPosOf(inputRef.current, draft),
                });
                const parsed = parseDraft(draft);
                const base =
                    parsed !== null ? clampAndQuantize(parsed, min, max, fineStep) : valueRef.current;
                startPress(sign, base, stepSize);
            } else {
                startPress(sign, undefined, resolveStep?.(null));
            }
        },
        [mode, draft, min, max, fineStep, startPress, parseDraft, resolveStep],
    );

    // Clean up listeners + any pointer lock on unmount (mid-interaction safety).
    // If a realtime drag or arrow press is still in progress, let the parent roll
    // back so the object is not left at an uncommitted preview value.
    useEffect(() => {
        return () => {
            if (cbRef.current.realtime && (dragRef.current?.crossed || pressRef.current)) {
                cbRef.current.onDragCancel?.();
            }
            teardown();
            const p = pressRef.current;
            if (p) {
                if (p.delayTimer !== null) clearTimeout(p.delayTimer);
                if (p.repeatTimer !== null) clearInterval(p.repeatTimer);
                document.removeEventListener('mouseup', endPress);
                pressRef.current = null;
            }
        };
    }, [teardown, endPress]);

    // --- Text edit ---

    useEffect(() => {
        if (mode === 'editing') {
            const el = inputRef.current;
            el?.focus();
            el?.select();
        }
    }, [mode]);

    // Put the caret back where a key step left it (the draft was rewritten from
    // the formatter, which resets the selection to the end).
    useEffect(() => {
        const el = inputRef.current;
        const want = caretRef.current;
        if (mode !== 'editing' || !el || want === null) return;
        caretRef.current = null;
        if (want === 'all') {
            el.select();
            return;
        }
        const pos = Math.min(want, draft.length);
        el.setSelectionRange?.(pos, pos);
    }, [draft, mode]);

    const commitEdit = useCallback(() => {
        // Starting an arrow press from edit mode moves focus to the root, which
        // blurs the input and fires this. Skip while a press is active: the
        // press commits the stepped value, and committing the draft here would
        // both overwrite that step and push a spurious extra undo step.
        if (pressRef.current) return;
        // A pending key-step hold is superseded by this commit; leaving it set
        // would let the trailing keyup commit the same value a second time.
        keyStepRef.current = null;
        const parsed = parseDraft(draft);
        if (parsed !== null) {
            const next = clampAndQuantize(parsed, min, max, fineStep);
            onChange(next);
            onRelease?.(next);
        }
        setMode('idle');
    }, [draft, min, max, fineStep, onChange, onRelease, parseDraft]);

    /**
     * Step the draft by one Up / Down press (opt-in via `resolveStep`). A held
     * key auto-repeats keydown, so the steps accumulate and the whole hold
     * commits once on key release -- the same one-interaction-one-undo-step
     * contract as a drag or an arrow press.
     */
    const keyStep = useCallback(
        (sign: 1 | -1) => {
            const input = inputRef.current;
            const caretPos = caretPosOf(input, draft);
            const stepSize = resolveStep?.({ text: draft, caretPos }) ?? step;
            const base = keyStepRef.current ?? parseDraft(draft) ?? valueRef.current;
            const next = clampAndQuantize(base + sign * stepSize, min, max, fineStep);
            keyStepRef.current = next;
            // Keep the selection on the segment being stepped so a repeat keeps
            // acting on it (the formatted width can change, e.g. 0:59 -> 1:00).
            caretRef.current = caretPos ?? 'all';
            setDraft(format(next));
            onChange(next);
        },
        [draft, resolveStep, step, min, max, fineStep, parseDraft, format, onChange],
    );

    /** Commit a finished Up / Down hold as one step. */
    const endKeyStep = useCallback(() => {
        const held = keyStepRef.current;
        if (held === null) return;
        keyStepRef.current = null;
        onRelease?.(held);
    }, [onRelease]);

    const handleEditKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                commitEdit();
                onCommitNext?.();
            } else if (e.key === 'Tab') {
                // Only intercept Tab when a sibling is wired; otherwise leave the
                // browser's native focus order intact.
                const target = e.shiftKey ? onCommitPrev : onCommitNext;
                if (target) {
                    e.preventDefault();
                    commitEdit();
                    target();
                }
            } else if (e.key === 'Escape') {
                keyStepRef.current = null;
                setMode('idle');
            } else if (resolveStep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                // Own the keys so a `type="number"` input's native spinner does
                // not step the draft a second time.
                e.preventDefault();
                keyStep(e.key === 'ArrowUp' ? 1 : -1);
            }
        },
        [commitEdit, onCommitNext, onCommitPrev, resolveStep, keyStep],
    );

    // --- Render ---

    const rootClass = [
        'h3-form-drag',
        mode === 'dragging' && 'h3-form-drag-active',
        mode === 'editing' && 'h3-form-drag-editing',
        disabled && 'h3-form-drag-disabled',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    // Value-fill fraction (0-100), or null when the range is not finite so no
    // meaningful position can be shown. Hidden while text-editing.
    const fillPct =
        Number.isFinite(min) && Number.isFinite(max) && max > min
            ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
            : null;

    const stacked = stepper === 'stacked';

    /** One step affordance; `stacked` only changes the glyph and its class. */
    const stepButton = (sign: 1 | -1) => (
        <button
            type="button"
            className={
                stacked
                    ? `h3-form-drag-spin h3-form-drag-spin-${sign > 0 ? 'up' : 'down'}`
                    : `h3-form-drag-arrow h3-form-drag-arrow-${sign > 0 ? 'right' : 'left'}`
            }
            tabIndex={-1}
            disabled={disabled || (sign > 0 ? value >= max : value <= min)}
            aria-label={sign > 0 ? 'Increment' : 'Decrement'}
            onMouseDown={(e) => handleStepButtonDown(e, sign)}
        >
            <AppIcon
                name={
                    stacked
                        ? sign > 0
                            ? 'ui.caretUp'
                            : 'ui.caretDown'
                        : sign > 0
                          ? 'ui.caretRight'
                          : 'ui.caretLeft'
                }
                size={10}
                aria-hidden
            />
        </button>
    );

    return (
        <div
            ref={rootRef}
            className={rootClass}
            tabIndex={disabled ? -1 : 0}
            aria-label={ariaLabel}
            title={title}
            onMouseDown={handleMouseDown}
            onMouseEnter={() => mode === 'idle' && setMode('hover')}
            onMouseLeave={() => mode === 'hover' && setMode('idle')}
        >
            {fillPct !== null && mode !== 'editing' && (
                <div
                    className="h3-form-drag-fill"
                    style={{ width: `${fillPct}%` }}
                    aria-hidden="true"
                />
            )}
            {!stacked && stepButton(-1)}

            {mode === 'editing' ? (
                <input
                    ref={inputRef}
                    type={parse ? 'text' : 'number'}
                    inputMode="numeric"
                    className="h3-form-drag-input"
                    value={draft}
                    step={parse ? undefined : fineStep}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onKeyUp={endKeyStep}
                    onBlur={commitEdit}
                />
            ) : (
                <span className="h3-form-drag-value">
                    {format(value)}
                    {unit != null && <span className="h3-form-drag-unit">{unit}</span>}
                </span>
            )}

            {stacked ? (
                <div className="h3-form-drag-spinner">
                    {stepButton(1)}
                    {stepButton(-1)}
                </div>
            ) : (
                stepButton(1)
            )}
        </div>
    );
});

DragNumericField.displayName = 'DragNumericField';
