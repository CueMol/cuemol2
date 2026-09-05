/**
 * @file h3-kit/form/TimeField/useSegmentStepper.ts
 * @description The stacked up / down buttons: one immediate step of the
 * active segment on press, then -- after a short delay -- a steady auto-repeat
 * until release. The whole press is one run and therefore one undo step, and
 * it keeps stepping the segment that was active when it began -- the thing
 * the pre-segment field could not do, because it had no active segment to
 * keep once the press left edit mode.
 *
 * Pressing a button while the expression editor is open steps from the typed
 * draft (when valid). The press is recorded before focus moves, because moving
 * focus blurs the input and fires the editor's commit -- which bails out while
 * a press is active, so the press commits the stepped value instead.
 */

import { useCallback, useEffect, useRef } from 'react';
import { STEP_REPEAT_DELAY_MS, STEP_REPEAT_INTERVAL_MS } from '../DragNumericField/dragMath';
import { clampMs, modifierOf, parseTimeInput, stepValue } from './timeMath';
import type { StepModifier } from './timeMath';
import type { TimeCore } from './types';

interface PressState {
    sign: 1 | -1;
    /** Modifier held at press time; a hold keeps it. */
    mod: StepModifier;
    delayTimer: ReturnType<typeof setTimeout> | null;
    repeatTimer: ReturnType<typeof setInterval> | null;
}

export interface UseSegmentStepperResult {
    /** Mousedown on a step button. */
    onStepButtonDown: (e: React.MouseEvent, sign: 1 | -1) => void;
    /** True while a press is running; the editor must not commit then. */
    isPressing: () => boolean;
}

export function useSegmentStepper(core: TimeCore): UseSegmentStepperResult {
    const {
        rootRef, valueRef, cbRef, activeUnitRef, modeRef, setMode, draft, run, disabled,
    } = core;
    const pressRef = useRef<PressState | null>(null);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    // Advance the run by one step of the active segment; stop repeating (but
    // keep the press, so the value still releases) once a bound is reached.
    const pressStep = useCallback(() => {
        const p = pressRef.current;
        if (!p) return;
        const { min, max } = cbRef.current;
        const held = run.held();
        const next = stepValue(held, activeUnitRef.current, p.sign, p.mod, min, max);
        if (next === held) {
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
        run.update(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const endPress = useCallback(() => {
        const p = pressRef.current;
        if (!p) return;
        pressRef.current = null;
        if (p.delayTimer !== null) clearTimeout(p.delayTimer);
        if (p.repeatTimer !== null) clearInterval(p.repeatTimer);
        document.removeEventListener('mouseup', endPress);
        run.end();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onStepButtonDown = useCallback(
        (e: React.MouseEvent, sign: 1 | -1) => {
            if (e.button !== 0) return;
            // Keep focus on the whole widget (not the button) and keep the
            // root's segment-press handler from firing.
            e.preventDefault();
            e.stopPropagation();
            if (disabled) return;

            let base: number | undefined;
            if (modeRef.current === 'editing') {
                const { min, max } = cbRef.current;
                const parsed = parseTimeInput(draftRef.current, valueRef.current);
                base = parsed !== null ? clampMs(parsed, min, max) : valueRef.current;
            }
            const p: PressState = {
                sign,
                mod: modifierOf(e),
                delayTimer: null,
                repeatTimer: null,
            };
            // Set the press before any focus change: leaving edit mode moves
            // focus to the root, blurring the input and firing commitEdit,
            // which bails out while a press is active.
            pressRef.current = p;
            if (modeRef.current === 'editing') {
                modeRef.current = 'idle';
                setMode('idle');
            }
            rootRef.current?.focus();
            run.begin('press', true, base);
            document.addEventListener('mouseup', endPress);
            pressStep();
            p.delayTimer = setTimeout(() => {
                p.delayTimer = null;
                if (pressRef.current !== p) return;
                p.repeatTimer = setInterval(pressStep, STEP_REPEAT_INTERVAL_MS);
            }, STEP_REPEAT_DELAY_MS);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [disabled, pressStep, endPress],
    );

    // Unmounting mid-press: clear the timers and the global listener. The
    // run's own unmount cleanup tells the parent to abandon the gesture.
    useEffect(() => {
        return () => {
            const p = pressRef.current;
            if (!p) return;
            pressRef.current = null;
            if (p.delayTimer !== null) clearTimeout(p.delayTimer);
            if (p.repeatTimer !== null) clearInterval(p.repeatTimer);
            document.removeEventListener('mouseup', endPress);
        };
    }, [endPress]);

    const isPressing = useCallback(() => pressRef.current !== null, []);

    return { onStepButtonDown, isPressing };
}
