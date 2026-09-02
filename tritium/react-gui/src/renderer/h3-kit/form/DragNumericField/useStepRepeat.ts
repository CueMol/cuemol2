/**
 * @file h3-kit/form/DragNumericField/useStepRepeat.ts
 * @description The step arrows: one immediate step on press, then -- after a
 * short delay -- a steady auto-repeat until release.
 *
 * The whole press is one interaction and therefore one undo step, exactly like
 * a drag: `onChange` fires per tick for the live number, `onRelease` fires once
 * on release with the accumulated value. That is why the running total lives in
 * `pressRef.held` rather than being read back from the `value` prop, which the
 * parent may not have echoed yet.
 *
 * Pressing an arrow while text-editing steps from the typed draft. The order
 * matters: the press is recorded before focus moves, because moving focus blurs
 * the input and fires the editor's commit -- which bails out when a press is
 * active, so the press commits the stepped value instead of the draft.
 */

import { useCallback, useEffect, useRef } from 'react';
import { clampAndQuantize } from '@renderer/h3-kit/form/numericMath';
import { STEP_REPEAT_DELAY_MS, STEP_REPEAT_INTERVAL_MS } from './dragMath';
import type { FieldCore, PressState } from './types';

export interface UseStepRepeatResult {
    /** Mousedown on a step arrow. */
    onStepButtonDown: (e: React.MouseEvent, sign: 1 | -1) => void;
    /** True while an arrow press is running; the editor must not commit then. */
    isPressing: () => boolean;
}

export function useStepRepeat(core: FieldCore): UseStepRepeatResult {
    const {
        mode, setMode, draft, rootRef, valueRef, cbRef,
        parseDraft, disabled, min, max, fineStep,
    } = core;
    const pressRef = useRef<PressState | null>(null);

    // Advance the held value by one `step`; stop repeating (but keep the press,
    // so the value still commits on release) once a bound is reached. Reads the
    // live accumulator + cbRef so the interval closure never goes stale.
    const pressStep = useCallback(() => {
        const p = pressRef.current;
        if (!p) return;
        const { min: lo, max: hi, step, fineStep: fine, onChange } = cbRef.current;
        const next = clampAndQuantize(p.held + p.sign * step, lo, hi, fine);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        (sign: 1 | -1, baseValue?: number) => {
            if (disabled) return;
            const p: PressState = {
                sign,
                held: baseValue ?? valueRef.current,
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [disabled, mode, pressStep, endPress],
    );

    // Mousedown on a step arrow. From text-edit mode it leaves editing and
    // steps from the typed draft (when a valid number) or else the current
    // value; from idle / hover it steps the current value. preventDefault keeps
    // focus on the whole widget (not the arrow) and lets us move focus
    // explicitly; stopPropagation keeps the root's body-drag handler from firing.
    const onStepButtonDown = useCallback(
        (e: React.MouseEvent, sign: 1 | -1) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            if (mode === 'editing') {
                const parsed = parseDraft(draft);
                const base =
                    parsed !== null ? clampAndQuantize(parsed, min, max, fineStep) : valueRef.current;
                startPress(sign, base);
            } else {
                startPress(sign);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mode, draft, min, max, fineStep, startPress, parseDraft],
    );

    // Unmounting mid-press: clear the timers and the global listener, and in
    // realtime mode let the parent roll back the uncommitted preview. A press
    // and a body drag cannot overlap (the arrow's stopPropagation keeps the
    // root's mousedown from firing), so at most one of the two cancels.
    useEffect(() => {
        return () => {
            const p = pressRef.current;
            if (!p) return;
            // Read at teardown, not at setup: `cbRef` is a data ref rewritten
            // every render, and the cancel has to reach the parent's current
            // callback. Copying it into the effect body -- what the lint rule
            // suggests for node refs -- would freeze a stale one.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const cb = cbRef.current;
            if (cb.realtime) cb.onDragCancel?.();
            if (p.delayTimer !== null) clearTimeout(p.delayTimer);
            if (p.repeatTimer !== null) clearInterval(p.repeatTimer);
            document.removeEventListener('mouseup', endPress);
            pressRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endPress]);

    const isPressing = useCallback(() => pressRef.current !== null, []);

    return { onStepButtonDown, isPressing };
}
