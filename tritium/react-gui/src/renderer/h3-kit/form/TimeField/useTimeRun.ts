/**
 * @file h3-kit/form/TimeField/useTimeRun.ts
 * @description The one interaction in flight. Every gesture -- drag, key hold,
 * digit buffer, stepper press, wheel notch, expression commit -- opens a run,
 * moves it, and either releases or abandons it, so the field's lifecycle
 * contract (`onDragStart` at most once, `onChange` per step, exactly one
 * `onRelease` or `onDragCancel`) is enforced in one place instead of once per
 * gesture.
 *
 * Callbacks are read through `cbRef` at call time so a run started by a
 * document-level listener or a timer keeps reaching the parent's current
 * handlers.
 */

import { useEffect, useMemo, useRef } from 'react';
import { clampMs } from './timeMath';
import type { RunKind, TimeCallbacks, TimeRun } from './types';

interface RunState {
    kind: RunKind;
    held: number;
}

export function useTimeRun(
    valueRef: React.MutableRefObject<number>,
    cbRef: React.MutableRefObject<TimeCallbacks>,
): TimeRun {
    const runRef = useRef<RunState | null>(null);

    const run = useMemo<TimeRun>(
        () => ({
            begin(kind, announce, startMs) {
                const prev = runRef.current;
                const start = startMs ?? (prev ? prev.held : valueRef.current);
                // A run replacing another releases the old one first, so two
                // gestures can never share one release.
                if (prev) {
                    runRef.current = null;
                    cbRef.current.onRelease?.(prev.held);
                }
                runRef.current = { kind, held: start };
                if (announce) cbRef.current.onDragStart?.();
            },
            update(nextMs) {
                const r = runRef.current;
                if (!r) return;
                const { min, max } = cbRef.current;
                const next = clampMs(nextMs, min, max);
                if (next === r.held) return;
                r.held = next;
                cbRef.current.onChange(next);
            },
            end() {
                const r = runRef.current;
                if (!r) return;
                runRef.current = null;
                cbRef.current.onRelease?.(r.held);
            },
            cancel() {
                const r = runRef.current;
                if (!r) return;
                runRef.current = null;
                cbRef.current.onDragCancel?.();
            },
            active: () => runRef.current?.kind ?? null,
            held: () => (runRef.current ? runRef.current.held : valueRef.current),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    // Unmounting mid-run: let the parent abandon the gesture (roll back a
    // realtime preview, or just drop the draft). Read `cbRef` at teardown,
    // not at setup: it is rewritten every render and the cancel has to reach
    // the parent's current callback.
    useEffect(() => {
        return () => {
            if (!runRef.current) return;
            runRef.current = null;
            // eslint-disable-next-line react-hooks/exhaustive-deps
            cbRef.current.onDragCancel?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return run;
}
