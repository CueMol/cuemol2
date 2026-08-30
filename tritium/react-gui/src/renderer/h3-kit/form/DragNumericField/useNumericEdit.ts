/**
 * @file h3-kit/form/DragNumericField/useNumericEdit.ts
 * @description Text-edit mode: the draft the input shows, how it commits, and
 * the optional Up / Down stepping inside it.
 *
 * A held Up / Down key auto-repeats keydown, so the steps accumulate in
 * `keyStepRef` and the whole hold commits once on key release -- the same
 * one-interaction-one-undo-step contract a drag or an arrow press has.
 *
 * The caret is restored explicitly after each key step. Rewriting the draft
 * from the formatter resets the selection to the end, which for a segmented
 * value (a timecode, say) would move the next repeat onto a different segment
 * mid-hold.
 */

import { useCallback, useEffect, useRef } from 'react';
import { clampAndQuantize } from '@renderer/h3-kit/form/numericMath';
import { caretPosOf } from './dragMath';
import type { FieldCore } from './types';

export interface UseNumericEditResult {
    /** Blur / Enter commit of the typed draft. */
    commitEdit: () => void;
    onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    /** Keyup: commits a finished Up / Down hold as one step. */
    endKeyStep: () => void;
}

export interface UseNumericEditOptions {
    step: number;
    onChange: (v: number) => void;
    onRelease?: (v: number) => void;
    onCommitNext?: () => void;
    onCommitPrev?: () => void;
    resolveStep?: (ctx: { text: string; caretPos: number | null } | null) => number;
    /** True while an arrow press is running (see the commit guard below). */
    isPressing: () => boolean;
}

export function useNumericEdit(
    core: FieldCore,
    {
        step, onChange, onRelease, onCommitNext, onCommitPrev, resolveStep, isPressing,
    }: UseNumericEditOptions,
): UseNumericEditResult {
    const {
        mode, setMode, draft, setDraft, inputRef, valueRef,
        format, parseDraft, min, max, fineStep,
    } = core;

    // Value accumulated by a held Up / Down key, committed once on key release.
    const keyStepRef = useRef<number | null>(null);
    // Selection to restore after a key step rewrites the draft: a caret offset,
    // or 'all' to keep the whole draft selected (so a repeat keeps reading as
    // "no caret" and stays on the default step instead of drifting to the
    // segment that happens to sit at offset 0).
    const caretRef = useRef<number | 'all' | null>(null);

    useEffect(() => {
        if (mode === 'editing') {
            const el = inputRef.current;
            el?.focus();
            el?.select();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Put the caret back where a key step left it (the draft was rewritten from
    // the formatter, which resets the selection to the end).
    useEffect(() => {
        const el = inputRef.current;
        const want = caretRef.current;
        if (mode !== 'editing' || !el || want === null) return;
        caretRef.current = null;
        if (want === 'all') {
            el.select();
            return;
        }
        const pos = Math.min(want, draft.length);
        el.setSelectionRange?.(pos, pos);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, mode]);

    const commitEdit = useCallback(() => {
        // Starting an arrow press from edit mode moves focus to the root, which
        // blurs the input and fires this. Skip while a press is active: the
        // press commits the stepped value, and committing the draft here would
        // both overwrite that step and push a spurious extra undo step.
        if (isPressing()) return;
        // A pending key-step hold is superseded by this commit; leaving it set
        // would let the trailing keyup commit the same value a second time.
        keyStepRef.current = null;
        const parsed = parseDraft(draft);
        if (parsed !== null) {
            const next = clampAndQuantize(parsed, min, max, fineStep);
            onChange(next);
            onRelease?.(next);
        }
        setMode('idle');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, min, max, fineStep, onChange, onRelease, parseDraft, isPressing]);

    /**
     * Step the draft by one Up / Down press (opt-in via `resolveStep`). A held
     * key auto-repeats keydown, so the steps accumulate and the whole hold
     * commits once on key release.
     */
    const keyStep = useCallback(
        (sign: 1 | -1) => {
            const input = inputRef.current;
            const caretPos = caretPosOf(input, draft);
            const stepSize = resolveStep?.({ text: draft, caretPos }) ?? step;
            const base = keyStepRef.current ?? parseDraft(draft) ?? valueRef.current;
            const next = clampAndQuantize(base + sign * stepSize, min, max, fineStep);
            keyStepRef.current = next;
            // Keep the selection on the segment being stepped so a repeat keeps
            // acting on it (the formatted width can change, e.g. 0:59 -> 1:00).
            caretRef.current = caretPos ?? 'all';
            setDraft(format(next));
            onChange(next);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [draft, resolveStep, step, min, max, fineStep, parseDraft, format, onChange],
    );

    /** Commit a finished Up / Down hold as one step. */
    const endKeyStep = useCallback(() => {
        const held = keyStepRef.current;
        if (held === null) return;
        keyStepRef.current = null;
        onRelease?.(held);
    }, [onRelease]);

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
                keyStepRef.current = null;
                setMode('idle');
            } else if (resolveStep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                // Own the keys so a `type="number"` input's native spinner does
                // not step the draft a second time.
                e.preventDefault();
                keyStep(e.key === 'ArrowUp' ? 1 : -1);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [commitEdit, onCommitNext, onCommitPrev, resolveStep, keyStep],
    );

    return { commitEdit, onEditKeyDown, endKeyStep };
}
