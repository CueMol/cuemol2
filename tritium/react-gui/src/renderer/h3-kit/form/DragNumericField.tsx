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
 * The drag sensitivity is `step / pxPerStep` value units per pixel (constant
 * for a given field; `pxPerStep` defaults to 8). Only the snap granularity
 * changes with a modifier, so Shift gives finer resolution rather than slower
 * motion. The `<` / `>` arrows, by contrast, increment / decrement by `step`
 * (independent of `pxPerStep`), and auto-repeat while held down (one immediate
 * step, then -- after a short delay -- a steady stream of steps until release).
 *
 * The widget is focusable as a single unit (`tabIndex=0` on the root); its
 * parts (arrows, edit input) never take a separate focus ring. Keyboard
 * interaction on the focused widget is intentionally not implemented yet
 * (Blender's number button has no key-input focus); only the edit input
 * handles Enter / Escape while editing.
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
 * Default pixels of horizontal travel that move the raw value by one normal
 * `step`. Overridable per-field via the `pxPerStep` prop (smaller = more
 * sensitive; e.g. 1 reproduces the UXP fakedial wheel's 1 unit / pixel).
 */
const PX_PER_STEP = 8;
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
     * Pixels of horizontal drag that move the raw value by one `step`. Default
     * 8. Lower it to make the field more sensitive (e.g. 1 = 1 unit / pixel,
     * matching the UXP fakedial wheel). Does not affect the snap granularity or
     * the arrow increment, only the drag-speed.
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
     * Treat a drag as a live transaction: emit `onDragStart` / `onDragCancel`
     * so the parent can preview-while-dragging and commit once on release. When
     * false (default), no drag-lifecycle callbacks fire and behaviour is
     * unchanged. See the file header.
     */
    realtime?: boolean;
    /**
     * Fired once when a drag crosses the movement threshold (only when
     * `realtime`). The parent typically snapshots the pre-drag value here so it
     * can roll back / build a single undo step.
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
}

/** Transient arrow-press bookkeeping for the auto-repeat hold. */
interface PressState {
    sign: 1 | -1;
    /** Accumulated value during the hold; advanced one `step` per tick. */
    held: number;
    /** Initial-delay timeout, then the repeat interval (cleared on release). */
    delayTimer: ReturnType<typeof setTimeout> | null;
    repeatTimer: ReturnType<typeof setInterval> | null;
}

type Mode = 'idle' | 'hover' | 'dragging' | 'editing';

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
    pxPerStep = PX_PER_STEP,
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
}, ref) => {
    const [mode, setMode] = useState<Mode>('idle');
    const [draft, setDraft] = useState('');

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const pressRef = useRef<PressState | null>(null);

    // Finest resolution the value can take (the Shift snap); drives both
    // storage quantization and the default display precision. The coarse snap
    // (Ctrl / Cmd) is the largest. Both default to a 10th / 10x of `step`.
    const fineStep = fineSnap ?? step / SNAP_FACTOR;
    const coarseStep = coarseSnap ?? step * SNAP_FACTOR;
    const dispDecimals = decimals ?? decimalsOf(fineStep);
    const format = useCallback(
        (v: number) => v.toFixed(dispDecimals),
        [dispDecimals],
    );

    // The global mousemove closure must see the latest committed value (for the
    // onRelease commit) without re-subscribing the listener.
    const valueRef = useRef(value);
    valueRef.current = value;

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
        const { onChange, min, max, step, pxPerStep, fineStep, coarseStep } = cbRef.current;

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

        // Constant sensitivity (value units per pixel); the modifier only
        // changes the snap granularity, so the raw value moves at the same
        // rate but is forced to a finer / coarser multiple.
        const raw = d.startValue + (d.accumPx / pxPerStep) * step;
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
        if (d?.crossed) {
            // Drag end -> single commit of the latest value.
            cbRef.current.onRelease?.(valueRef.current);
            setMode('hover');
        } else {
            // Press without crossing the threshold -> treat as a click: edit.
            setDraft(format(valueRef.current));
            setMode('editing');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teardown, format]);

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
            dragRef.current = { startValue: value, accumPx: 0, crossed: false };
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
        const { min, max, step, fineStep, onChange } = cbRef.current;
        const next = clampAndQuantize(p.held + p.sign * step, min, max, fineStep);
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
    const startPress = useCallback(
        (sign: 1 | -1) => {
            if (disabled || mode === 'editing') return;
            rootRef.current?.focus();
            // Announce the interaction start before the first onChange so the
            // parent can snapshot the pre-step value for a single undo step.
            cbRef.current.onDragStart?.();
            const p: PressState = {
                sign,
                held: valueRef.current,
                delayTimer: null,
                repeatTimer: null,
            };
            pressRef.current = p;
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

    const commitEdit = useCallback(() => {
        const parsed = Number(draft);
        if (draft.trim() !== '' && Number.isFinite(parsed)) {
            const next = clampAndQuantize(parsed, min, max, fineStep);
            onChange(next);
            onRelease?.(next);
        }
        setMode('idle');
    }, [draft, min, max, fineStep, onChange, onRelease]);

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
                setMode('idle');
            }
        },
        [commitEdit, onCommitNext, onCommitPrev],
    );

    // --- Render ---

    const rootClass = [
        'h3-form-drag',
        mode === 'dragging' && 'h3-form-drag-active',
        mode === 'editing' && 'h3-form-drag-editing',
        disabled && 'h3-form-drag-disabled',
    ]
        .filter(Boolean)
        .join(' ');

    // Value-fill fraction (0-100), or null when the range is not finite so no
    // meaningful position can be shown. Hidden while text-editing.
    const fillPct =
        Number.isFinite(min) && Number.isFinite(max) && max > min
            ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
            : null;

    return (
        <div
            ref={rootRef}
            className={rootClass}
            tabIndex={disabled ? -1 : 0}
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
            <button
                type="button"
                className="h3-form-drag-arrow h3-form-drag-arrow-left"
                tabIndex={-1}
                disabled={disabled || value <= min}
                aria-label="Decrement"
                // preventDefault keeps focus on the whole widget, not the arrow;
                // stopPropagation keeps the root's body-drag handler from firing.
                onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    startPress(-1);
                }}
            >
                <AppIcon name="ui.caretLeft" size={10} aria-hidden />
            </button>

            {mode === 'editing' ? (
                <input
                    ref={inputRef}
                    type="number"
                    className="h3-form-drag-input"
                    value={draft}
                    step={fineStep}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={commitEdit}
                />
            ) : (
                <span className="h3-form-drag-value">
                    {format(value)}
                    {unit != null && <span className="h3-form-drag-unit">{unit}</span>}
                </span>
            )}

            <button
                type="button"
                className="h3-form-drag-arrow h3-form-drag-arrow-right"
                tabIndex={-1}
                disabled={disabled || value >= max}
                aria-label="Increment"
                onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    startPress(1);
                }}
            >
                <AppIcon name="ui.caretRight" size={10} aria-hidden />
            </button>
        </div>
    );
});

DragNumericField.displayName = 'DragNumericField';
