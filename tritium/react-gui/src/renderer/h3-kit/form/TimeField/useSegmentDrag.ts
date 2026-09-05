/**
 * @file h3-kit/form/TimeField/useSegmentDrag.ts
 * @description Drag on a segment: press, cross a threshold, take pointer lock,
 * and turn `movementX` into steps of that segment's unit until release.
 *
 * The listener discipline is the one `DragNumericField/useDragValue` settled
 * on and is easy to break: the document listeners are attached once at
 * mousedown and read `cbRef` / the drag ref instead of closing over props, so
 * a re-render never re-attaches them; `handleMouseUp` must stay
 * reference-stable because the equally stable `teardown` is what removes it.
 * A press that never crosses the threshold is a click, and a click selects the
 * segment.
 *
 * The drag moves the value by a snapped DELTA from where it started rather
 * than snapping the value itself, so scrubbing the seconds leaves `.345`
 * intact. Shift slows the rate as well as refining the snap (a precision
 * mode); Ctrl / Cmd only coarsens the snap, which is visible on its own.
 */

import { useCallback, useEffect, useRef } from 'react';
import { snapTo } from '@renderer/h3-kit/form/numericMath';
import { DRAG_THRESHOLD_PX, SNAP_FACTOR } from '../DragNumericField/dragMath';
import { PX_PER_UNIT, UNIT_MS, modifierOf, stepMs } from './timeMath';
import type { TimeUnit } from './timeMath';
import type { TimeCore } from './types';

interface DragState {
    unit: TimeUnit;
    startMs: number;
    /** Total horizontal travel; only the drag-vs-click threshold reads it. */
    accumPx: number;
    /**
     * Milliseconds moved so far, accumulated per frame because the rate is
     * not constant (Shift slows it); recomputing the whole travel at a new
     * rate would make the value jump when the key goes down.
     */
    accumMs: number;
    crossed: boolean;
}

export interface UseSegmentDragResult {
    /** Mousedown on (or nearest to) a segment. */
    onSegmentMouseDown: (e: React.MouseEvent, unit: TimeUnit) => void;
}

export function useSegmentDrag(core: TimeCore): UseSegmentDragResult {
    const { rootRef, valueRef, cbRef, modeRef, setMode, setActiveUnit, run, disabled } = core;
    const dragRef = useRef<DragState | null>(null);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const mod = modifierOf(e);
        const rate = UNIT_MS[d.unit] / PX_PER_UNIT;
        d.accumPx += e.movementX;
        d.accumMs += e.movementX * (mod === 'fine' ? rate / SNAP_FACTOR : rate);

        if (!d.crossed) {
            if (Math.abs(d.accumPx) <= DRAG_THRESHOLD_PX) return;
            d.crossed = true;
            setMode('dragging');
            // Realtime: announce before the first onChange so the parent can
            // snapshot the pre-drag value for a single commit.
            run.begin('drag', cbRef.current.realtime, d.startMs);
            // Hide the OS cursor + unbind from screen edges (best-effort).
            const locked = rootRef.current?.requestPointerLock?.() as Promise<void> | void;
            if (locked && typeof locked.catch === 'function') locked.catch(() => {});
        }

        run.update(d.startMs + snapTo(d.accumMs, stepMs(d.unit, mod)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // No active press for this field -> a stray / leaked mouseup.
        if (!d) return;
        if (d.crossed) {
            run.end();
            setMode('idle');
        } else {
            // Press without crossing the threshold -> a click: select.
            setActiveUnit(d.unit);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teardown]);

    // Losing pointer lock mid-drag means the user pressed Esc: abandon the
    // drag whatever the mode. Committing here would write the value the user
    // asked to discard.
    const handlePointerLockChange = useCallback(() => {
        if (dragRef.current?.crossed && document.pointerLockElement !== rootRef.current) {
            dragRef.current = null;
            teardown();
            setMode('idle');
            run.cancel();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [teardown]);

    const onSegmentMouseDown = useCallback(
        (e: React.MouseEvent, unit: TimeUnit) => {
            if (disabled || modeRef.current === 'editing' || e.button !== 0) return;
            e.preventDefault();
            // Focus the widget as a whole (preventDefault above suppresses the
            // implicit focus, so do it explicitly) and show which segment the
            // press is on.
            rootRef.current?.focus();
            setActiveUnit(unit);
            dragRef.current = {
                unit,
                startMs: valueRef.current,
                accumPx: 0,
                accumMs: 0,
                crossed: false,
            };
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('pointerlockchange', handlePointerLockChange);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [disabled, handleMouseMove, handleMouseUp, handlePointerLockChange],
    );

    // Unmounting mid-drag: drop the listeners and the pointer lock. The run's
    // own unmount cleanup tells the parent to abandon the gesture.
    useEffect(() => {
        return () => {
            dragRef.current = null;
            teardown();
        };
    }, [teardown]);

    return { onSegmentMouseDown };
}
