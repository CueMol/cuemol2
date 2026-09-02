/**
 * @file h3-kit/form/DragNumericField/useNumericEdit.ts
 * @description Text-edit mode: the draft the input shows and how it commits.
 * The input is a native `type="number"`, so Up / Down inside it are the
 * browser's own spinner; keyboard stepping is not part of this widget (see
 * the file header of `index.tsx`).
 */

import { useCallback, useEffect } from 'react';
import { clampAndQuantize } from '@renderer/h3-kit/form/numericMath';
import type { FieldCore } from './types';

export interface UseNumericEditResult {
    /** Blur / Enter commit of the typed draft. */
    commitEdit: () => void;
    onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface UseNumericEditOptions {
    onChange: (v: number) => void;
    onRelease?: (v: number) => void;
    onCommitNext?: () => void;
    onCommitPrev?: () => void;
    /** True while an arrow press is running (see the commit guard below). */
    isPressing: () => boolean;
}

export function useNumericEdit(
    core: FieldCore,
    { onChange, onRelease, onCommitNext, onCommitPrev, isPressing }: UseNumericEditOptions,
): UseNumericEditResult {
    const { mode, setMode, draft, inputRef, parseDraft, min, max, fineStep } = core;

    useEffect(() => {
        if (mode === 'editing') {
            const el = inputRef.current;
            el?.focus();
            el?.select();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const commitEdit = useCallback(() => {
        // Starting an arrow press from edit mode moves focus to the root, which
        // blurs the input and fires this. Skip while a press is active: the
        // press commits the stepped value, and committing the draft here would
        // both overwrite that step and push a spurious extra undo step.
        if (isPressing()) return;
        const parsed = parseDraft(draft);
        if (parsed !== null) {
            const next = clampAndQuantize(parsed, min, max, fineStep);
            onChange(next);
            onRelease?.(next);
        }
        setMode('idle');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, min, max, fineStep, onChange, onRelease, parseDraft, isPressing]);

    const onEditKeyDown = useCallback(
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [commitEdit, onCommitNext, onCommitPrev],
    );

    return { commitEdit, onEditKeyDown };
}
