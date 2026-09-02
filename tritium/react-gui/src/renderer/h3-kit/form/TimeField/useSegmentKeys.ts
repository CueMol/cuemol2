/**
 * @file h3-kit/form/TimeField/useSegmentKeys.ts
 * @description Keyboard on the focused field: Up / Down step the active
 * segment (a held key is one run), Left / Right / Home / End move the active
 * segment, digits overwrite it (carrying, and moving on when the segment is
 * full), Backspace / Delete zero it, Enter / F2 / `+` / `-` open the
 * expression editor, Esc abandons an open run. Tab is left to the browser;
 * a blur that leaves the field releases whatever run is open.
 */

import { useCallback, useRef } from 'react';
import {
    SEGMENT_DIGITS,
    modifierOf,
    neighborUnit,
    stepValue,
    visibleUnits,
    withSegmentDigits,
} from './timeMath';
import type { TimeUnit } from './timeMath';
import type { TimeCore } from './types';

interface DigitBuffer {
    unit: TimeUnit;
    digits: string;
}

export interface UseSegmentKeysResult {
    onRootKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    onRootKeyUp: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    onRootBlur: (e: React.FocusEvent<HTMLDivElement>) => void;
    onRootDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export interface UseSegmentKeysOptions {
    openEditor: (prefill?: string) => void;
}

export function useSegmentKeys(core: TimeCore, { openEditor }: UseSegmentKeysOptions): UseSegmentKeysResult {
    const {
        rootRef, inputRef, cbRef, activeUnitRef, setActiveUnit, modeRef, run, disabled,
    } = core;
    const bufferRef = useRef<DigitBuffer | null>(null);

    /** Release the open run (if any) and forget the digit buffer. */
    const closeRun = useCallback(() => {
        bufferRef.current = null;
        run.end();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onRootKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (disabled || modeRef.current === 'editing' || e.target === inputRef.current) return;
            if (e.altKey) return;
            const { min, max } = cbRef.current;
            const unit = activeUnitRef.current;
            const units = visibleUnits(run.held());

            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (run.active() !== 'keys') {
                    bufferRef.current = null;
                    run.begin('keys', true);
                }
                const sign = e.key === 'ArrowUp' ? 1 : -1;
                run.update(stepValue(run.held(), unit, sign, modifierOf(e), min, max));
                return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                closeRun();
                setActiveUnit(neighborUnit(units, unit, e.key === 'ArrowLeft' ? -1 : 1));
                return;
            }
            if (e.key === 'Home' || e.key === 'End') {
                e.preventDefault();
                closeRun();
                setActiveUnit(e.key === 'Home' ? units[0] : units[units.length - 1]);
                return;
            }
            if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                let buf = bufferRef.current;
                if (!buf || buf.unit !== unit || run.active() !== 'digits') {
                    buf = { unit, digits: '' };
                    bufferRef.current = buf;
                    run.begin('digits', true);
                }
                buf.digits += e.key;
                run.update(withSegmentDigits(run.held(), unit, buf.digits, min, max));
                if (buf.digits.length >= SEGMENT_DIGITS[unit]) {
                    // Segment complete: release and move on to the next one.
                    const after = visibleUnits(run.held());
                    closeRun();
                    setActiveUnit(neighborUnit(after, unit, 1));
                }
                return;
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                closeRun();
                run.begin('keys', false);
                run.update(withSegmentDigits(run.held(), unit, '', min, max));
                run.end();
                return;
            }
            if (e.key === 'Enter' || e.key === 'F2') {
                e.preventDefault();
                // With a run pending, Enter only closes it; the editor opens
                // on the next press.
                if (run.active()) {
                    closeRun();
                    return;
                }
                openEditor();
                return;
            }
            if (e.key === '+' || e.key === '-') {
                e.preventDefault();
                closeRun();
                openEditor(e.key);
                return;
            }
            if (e.key === 'Escape') {
                if (!run.active()) return; // not ours: let the container see it
                e.preventDefault();
                e.stopPropagation();
                bufferRef.current = null;
                run.cancel();
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [disabled, closeRun, openEditor],
    );

    const onRootKeyUp = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && run.active() === 'keys') {
                run.end();
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    // Focus leaving the field releases a key / digit run. A drag or a stepper
    // press has its own document-level release and keeps focus anyway.
    const onRootBlur = useCallback(
        (e: React.FocusEvent<HTMLDivElement>) => {
            const next = e.relatedTarget as Node | null;
            if (next && rootRef.current?.contains(next)) return;
            const kind = run.active();
            if (kind === 'keys' || kind === 'digits') closeRun();
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [closeRun],
    );

    const onRootDoubleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (disabled || modeRef.current === 'editing') return;
            if ((e.target as HTMLElement).closest?.('button')) return;
            e.preventDefault();
            openEditor();
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [disabled, openEditor],
    );

    return { onRootKeyDown, onRootKeyUp, onRootBlur, onRootDoubleClick };
}
