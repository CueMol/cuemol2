/**
 * @file components/widgets/form/DragNumericField.tsx
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
 *   - Shift       -> snap to `step / 10`   (fine)
 *   - Ctrl / Cmd  -> snap to `step * 10`   (coarse)
 * The drag sensitivity (value units per pixel) is constant; only the snap
 * granularity changes, so Shift gives finer resolution rather than slower
 * motion. The `<` / `>` arrows, by contrast, increment / decrement by `step`.
 *
 * The widget is focusable as a single unit (`tabIndex=0` on the root); its
 * parts (arrows, edit input) never take a separate focus ring. Keyboard
 * interaction on the focused widget is intentionally not implemented yet
 * (Blender's number button has no key-input focus); only the edit input
 * handles Enter / Escape while editing.
 *
 * Sizing/spacing/colors come entirely from `.fk-drag*` in `styles/_form-kit.css`
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
 * frame, every step click, on text commit) for a live draft; `onRelease` fires
 * once at the end of an interaction (drag end, step click, Enter/blur) so the
 * parent can push a single undo step.
 *
 * Realtime mode (`realtime`): for props that benefit from live object feedback,
 * the field also emits `onDragStart` when a drag begins and `onDragCancel` if a
 * drag is aborted (Esc mid-drag, or unmount mid-drag). This lets a parent run a
 * preview-while-dragging / single-commit-on-release lifecycle (apply the value
 * to the object every `onChange` without undo, then commit one undo step on
 * `onRelease`, or roll back on `onDragCancel`). Without `realtime` (the
 * default), behaviour is unchanged: no drag-lifecycle callbacks fire and Esc
 * mid-drag commits the current value like a normal release.
 *
 * @module form/DragNumericField
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@blueprintjs/core';

void React; // classic JSX runtime (vitest)

/** Pixels of horizontal travel before a press becomes a drag (vs a click). */
const DRAG_THRESHOLD_PX = 4;
/** Pixels of horizontal travel that move the raw value by one normal `step`. */
const PX_PER_STEP = 8;
/** Factor between the normal snap and the fine (Shift) / coarse (Ctrl) snaps. */
const SNAP_FACTOR = 10;

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
}

/** Decimal places implied by `step` (0.1 -> 1, 0.01 -> 2, 1 -> 0). */
function decimalsOf(step: number): number {
    if (!Number.isFinite(step) || step <= 0) return 0;
    return Math.max(0, -Math.floor(Math.log10(step)));
}

/**
 * Round `v` to the precision implied by `step`, stripping IEEE-754 drift from
 * accumulating across drag frames / step clicks.
 */
function quantize(v: number, step: number): number {
    if (!Number.isFinite(step) || step <= 0) return v;
    return Number(v.toFixed(decimalsOf(step)));
}

/** Clamp to [min, max] then quantize to `step`. */
function clampAndQuantize(v: number, min: number, max: number, step: number): number {
    return quantize(Math.min(max, Math.max(min, v)), step);
}

/** Snap `v` to the nearest multiple of `snap` (absolute multiples from 0). */
function snapTo(v: number, snap: number): number {
    if (!Number.isFinite(snap) || snap <= 0) return v;
    return Math.round(v / snap) * snap;
}

/** Transient drag bookkeeping, read by the global mousemove closure. */
interface DragState {
    startValue: number;
    accumPx: number;
    crossed: boolean;
}

type Mode = 'idle' | 'hover' | 'dragging' | 'editing';

/**
 * Blender-style draggable numeric field. See the file header for the drag /
 * click / step interaction model and commit timing.
 */
export const DragNumericField: React.FC<DragNumericFieldProps> = ({
    value,
    onChange,
    onRelease,
    min = -Infinity,
    max = Infinity,
    step = 1,
    decimals,
    unit,
    disabled,
    realtime = false,
    onDragStart,
    onDragCancel,
}) => {
    const [mode, setMode] = useState<Mode>('idle');
    const [draft, setDraft] = useState('');

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dragRef = useRef<DragState | null>(null);

    // Finest resolution the value can take (the Shift snap); drives both
    // storage quantization and the default display precision.
    const fineStep = step / SNAP_FACTOR;
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
    const cbRef = useRef({ onChange, onRelease, min, max, step, realtime, onDragStart, onDragCancel });
    cbRef.current = { onChange, onRelease, min, max, step, realtime, onDragStart, onDragCancel };

    // --- Drag (global listeners + pointer lock) ---

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const { onChange, min, max, step } = cbRef.current;

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
        const raw = d.startValue + (d.accumPx / PX_PER_STEP) * step;
        const snap = e.shiftKey
            ? step / SNAP_FACTOR
            : e.ctrlKey || e.metaKey
              ? step * SNAP_FACTOR
              : step;
        const next = clampAndQuantize(snapTo(raw, snap), min, max, step / SNAP_FACTOR);
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

    // Clean up listeners + any pointer lock on unmount (mid-drag safety). If a
    // realtime drag is still in progress, let the parent roll back so the
    // object is not left at an uncommitted preview value.
    useEffect(() => {
        return () => {
            if (cbRef.current.realtime && dragRef.current?.crossed) {
                cbRef.current.onDragCancel?.();
            }
            teardown();
        };
    }, [teardown]);

    // --- Step arrows ---

    const stepBy = useCallback(
        (sign: 1 | -1) => {
            if (disabled) return;
            const next = clampAndQuantize(value + sign * step, min, max, fineStep);
            if (next === value) return;
            onChange(next);
            onRelease?.(next);
        },
        [disabled, value, step, fineStep, min, max, onChange, onRelease],
    );

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
            if (e.key === 'Enter') commitEdit();
            else if (e.key === 'Escape') setMode('idle');
        },
        [commitEdit],
    );

    // --- Render ---

    const rootClass = [
        'fk-drag',
        mode === 'dragging' && 'fk-drag-active',
        mode === 'editing' && 'fk-drag-editing',
        disabled && 'fk-drag-disabled',
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
                    className="fk-drag-fill"
                    style={{ width: `${fillPct}%` }}
                    aria-hidden="true"
                />
            )}
            <button
                type="button"
                className="fk-drag-arrow fk-drag-arrow-left"
                tabIndex={-1}
                disabled={disabled || value <= min}
                aria-label="Decrement"
                // preventDefault keeps focus on the whole widget, not the arrow.
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    stepBy(-1);
                }}
            >
                <Icon icon="chevron-left" size={10} />
            </button>

            {mode === 'editing' ? (
                <input
                    ref={inputRef}
                    type="number"
                    className="fk-drag-input"
                    value={draft}
                    step={fineStep}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={commitEdit}
                />
            ) : (
                <span className="fk-drag-value">
                    {format(value)}
                    {unit != null && <span className="fk-drag-unit">{unit}</span>}
                </span>
            )}

            <button
                type="button"
                className="fk-drag-arrow fk-drag-arrow-right"
                tabIndex={-1}
                disabled={disabled || value >= max}
                aria-label="Increment"
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    stepBy(1);
                }}
            >
                <Icon icon="chevron-right" size={10} />
            </button>
        </div>
    );
};
