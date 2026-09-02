/**
 * @file features/inspector/anim/useAnimTimingDrag.ts
 * @description Start and Duration of an animation element as two realtime
 * drag fields over the one `timing` write.
 *
 * Each field is a `useRealtimeDragProp` (previews while the gesture runs, one
 * commit on release, a restore on cancel); this hook turns the field's single
 * number back into the `{ startMs, endMs }` pair the worker writes. The other
 * half of the pair comes from a snapshot taken when the gesture began, not
 * from the committed detail: a preview moves the element, the timeline's
 * refetch adopts the moved detail, and deriving from that would let the
 * duration creep while the start is being dragged.
 *
 * The write receives the snapshot as `original` so the worker can record the
 * whole gesture as one undo step (restore, then write inside the transaction)
 * and so an abort knows where to go back to. A gesture that never announced
 * itself (a typed timecode, a wheel notch) commits against the committed
 * detail instead, which is where the element still is.
 */

import { useCallback, useRef } from 'react';
import { useRealtimeDragProp, type RealtimeDragProps } from '@renderer/hooks/react/useRealtimeDragProp';
import type { AnimTimingMs } from '@renderer/worker/server/services/anim/anim.service';
import type { PropWriteMode } from '@renderer/worker/shared/genericProps';

export interface TimingWriteOpts {
    mode: PropWriteMode;
    /** The pair the gesture started from; the restore anchor for commit / abort. */
    original: AnimTimingMs;
}

export interface UseAnimTimingDragOptions {
    /** The element's committed relative span, null until the detail loads. */
    committed: AnimTimingMs | null;
    /** Write the `timing` prop. A returned promise lets previews coalesce. */
    write: (value: AnimTimingMs, opts: TimingWriteOpts) => void | Promise<unknown>;
    /** Bump after a rejected commit so both fields re-mirror `committed`. */
    resyncKey?: unknown;
}

export interface AnimTimingDragProps {
    start: RealtimeDragProps;
    duration: RealtimeDragProps;
}

const ZERO: AnimTimingMs = { startMs: 0, endMs: 0 };

/** Duration is floored at 0 (start <= end); the start is passed through. */
function fromStart(startMs: number, base: AnimTimingMs): AnimTimingMs {
    return { startMs, endMs: startMs + Math.max(0, base.endMs - base.startMs) };
}

/**
 * A negative relative start is a legacy state the UI no longer produces but
 * must not disturb: editing the duration keeps the start as it is.
 */
function fromDuration(durationMs: number, base: AnimTimingMs): AnimTimingMs {
    return { startMs: base.startMs, endMs: base.startMs + Math.max(0, durationMs) };
}

export function useAnimTimingDrag({
    committed,
    write,
    resyncKey,
}: UseAnimTimingDragOptions): AnimTimingDragProps {
    const committedRef = useRef(committed);
    committedRef.current = committed;
    const writeRef = useRef(write);
    writeRef.current = write;
    /** The pair at gesture start; null between gestures. */
    const snapRef = useRef<AnimTimingMs | null>(null);

    const base = useCallback(() => snapRef.current ?? committedRef.current ?? ZERO, []);

    const useHalf = (toPair: (v: number, base: AnimTimingMs) => AnimTimingMs, value: number) => {
        const props = useRealtimeDragProp({
            committed: value,
            realtime: true,
            resyncKey,
            onPreview: (v) => writeRef.current(toPair(v, base()), { mode: 'preview', original: base() }),
            onCommit: (_original, v) => {
                const b = base();
                snapRef.current = null;
                return writeRef.current(toPair(v, b), { mode: 'commit', original: b });
            },
            onAbort: () => {
                const b = base();
                snapRef.current = null;
                return writeRef.current(b, { mode: 'abort', original: b });
            },
        });
        return props;
    };

    const startMs = committed?.startMs ?? 0;
    const durationMs = committed ? committed.endMs - committed.startMs : 0;
    const start = useHalf(fromStart, startMs);
    const duration = useHalf(fromDuration, durationMs);

    // Snapshot on announce, before the first preview can move the element.
    const onStartDragStart = useCallback(() => {
        snapRef.current = committedRef.current;
        start.onDragStart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start.onDragStart]);
    const onDurationDragStart = useCallback(() => {
        snapRef.current = committedRef.current;
        duration.onDragStart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [duration.onDragStart]);

    return {
        start: { ...start, onDragStart: onStartDragStart },
        duration: { ...duration, onDragStart: onDurationDragStart },
    };
}
