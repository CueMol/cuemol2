/**
 * @file h3-kit/form/DragNumericField/useDragValue.ts
 * @description The body drag: press, cross a threshold, take pointer lock, and
 * turn `movementX` into value changes until release.
 *
 * Two things here are easy to break and are the reason the code reads the way
 * it does:
 *
 *   - The document listeners are attached once at mousedown and must keep
 *     reaching current behaviour. They read `cbRef` / `valueRef` / `formatRef`
 *     instead of closing over props, so a re-render never has to re-attach
 *     them. `handleMouseUp` in particular must stay reference-stable, because
 *     the equally stable `teardown` is what removes it; if a changing formatter
 *     recreated it, teardown would remove a stale listener and leak the live
 *     one -- and a later stray mouseup would then drop the field into edit mode
 *     and swallow a click meant for another widget.
 *   - A press that never crosses the threshold is a click, and a click opens
 *     the editor. That is the hand-off that makes this hook write the shared
 *     mode and draft rather than owning them.
 */

import { useCallback, useEffect, useRef } from 'react';
import { clampAndQuantize, snapTo } from '@renderer/h3-kit/form/numericMath';
import { DRAG_THRESHOLD_PX, SNAP_FACTOR, dragValuePerPx } from './dragMath';
import type { DragState, FieldCore } from './types';

export interface UseDragValueResult {
    /** Mousedown on the field body. */
    onMouseDown: (e: React.MouseEvent) => void;
}

export interface UseDragValueOptions {
    /**
     * Called as the precision modifier goes down and up during a drag, so the
     * field can show the extra digits Shift can now reach.
     */
    onFineDragChange: (fine: boolean) => void;
}

export function useDragValue(
    core: FieldCore,
    value: number,
    { onFineDragChange }: UseDragValueOptions,
): UseDragValueResult {
    const { mode, setMode, setDraft, rootRef, valueRef, formatRef, cbRef, disabled } = core;
    const dragRef = useRef<DragState | null>(null);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const { onChange, min, max, fineStep, coarseStep, step } = cbRef.current;

        // Shift is a precision modifier: it slows the motion as well as
        // refining the snap. Refining alone used to be enough, back when the
        // rate was a fixed `step / PX_PER_STEP` and one pixel moved less than
        // one step -- a snap of `step / 10` was then a real subdivision of a
        // pixel's travel. Once the rate became proportional to the field's
        // range, one pixel could cross several fine steps, and the modifier
        // stopped being perceptible at all: it snapped to values the drag was
        // already flying past.
        const fine = e.shiftKey;
        d.accumPx += e.movementX;
        d.accumValue +=
            e.movementX * (fine ? d.valuePerPx / SNAP_FACTOR : d.valuePerPx);
        onFineDragChange(fine);

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

        // Ctrl / Cmd stays a snap-only modifier: coarsening multiplies the
        // pixels each step costs, so it is visible without touching the rate.
        const raw = d.startValue + d.accumValue;
        const snap = fine
            ? fineStep
            : e.ctrlKey || e.metaKey
              ? coarseStep
              : step;
        const next = clampAndQuantize(snapTo(raw, snap), min, max, fineStep);
        onChange(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Forward declaration so handleMouseUp can remove itself + handleMouseMove.
    const teardown = useCallback(() => {
        onFineDragChange(false);
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

    // Losing pointer lock mid-drag means the user pressed Esc, so abandon the
    // drag whatever the mode. This used to commit the dragged value when
    // `realtime` was off, on the reasoning that there was no live preview to
    // roll back -- but the draft had still moved, so Esc quietly wrote the
    // value it was asked to discard. Cancelling is also the cheaper path
    // there: nothing was written, so the receiver only drops the draft.
    const handlePointerLockChange = useCallback(() => {
        if (dragRef.current?.crossed && document.pointerLockElement !== rootRef.current) {
            dragRef.current = null;
            teardown();
            setMode('hover');
            cbRef.current.onDragCancel?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teardown]);

    const onMouseDown = useCallback(
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
                accumValue: 0,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [disabled, mode, value, handleMouseMove, handleMouseUp, handlePointerLockChange],
    );

    // Unmounting mid-drag: drop the listeners and the pointer lock, and let
    // the parent abandon the gesture -- rolling back a realtime preview, or
    // just dropping the draft when there was nothing to preview.
    useEffect(() => {
        return () => {
            // Read at teardown, not at setup: `cbRef` is a data ref rewritten
            // every render, and the cancel has to reach the parent's current
            // callback. Copying it into the effect body -- what the lint rule
            // suggests for node refs -- would freeze a stale one.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const cb = cbRef.current;
            if (dragRef.current?.crossed) cb.onDragCancel?.();
            teardown();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teardown]);

    return { onMouseDown };
}
