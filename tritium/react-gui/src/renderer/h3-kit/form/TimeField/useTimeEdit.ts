/**
 * @file h3-kit/form/TimeField/useTimeEdit.ts
 * @description The expression editor: a text input over the segments that
 * takes the typed grammar (`1:30.500`, `250ms`, `1.5s`, `+2s`, `-1:30`) and
 * commits it as one interaction. Opened by double-click, Enter, F2, or typing
 * `+` / `-` (which lands in the input as the first character, the nudge
 * shorthand of timecode editors).
 */

import { useCallback, useEffect, useRef } from 'react';
import { clampMs, formatMs, parseTimeInput } from './timeMath';
import type { TimeCore } from './types';

export interface UseTimeEditResult {
    /**
     * Enter expression mode. `prefill` seeds the input (the formatted value
     * when omitted); `selectAll` selects it so typing replaces it.
     */
    openEditor: (prefill?: string) => void;
    /** Blur / Enter commit of the typed draft. `refocus` returns focus to the root. */
    commitEdit: (refocus: boolean) => void;
    onEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface UseTimeEditOptions {
    /** True while a stepper press is running (see the commit guard below). */
    isPressing: () => boolean;
}

export function useTimeEdit(core: TimeCore, { isPressing }: UseTimeEditOptions): UseTimeEditResult {
    const { rootRef, inputRef, valueRef, cbRef, mode, modeRef, setMode, draft, setDraft, run } = core;
    const selectAllRef = useRef(true);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    useEffect(() => {
        if (mode !== 'editing') return;
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        if (selectAllRef.current) el.select();
        else el.setSelectionRange?.(el.value.length, el.value.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Leaving edit mode moves focus back to the root, and the input's blur
    // fires synchronously inside that focus() call -- before React re-renders
    // `modeRef`. The ref is switched here by hand so that blur sees the editor
    // as already closed instead of committing the draft a second time.
    const closeEditor = useCallback(() => {
        modeRef.current = 'idle';
        setMode('idle');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openEditor = useCallback(
        (prefill?: string) => {
            // A pending run (digit buffer, key hold) is released before the
            // editor takes over the value.
            run.end();
            selectAllRef.current = prefill === undefined;
            setDraft(prefill ?? formatMs(valueRef.current));
            setMode('editing');
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const commitEdit = useCallback(
        (refocus: boolean) => {
            // Starting a stepper press from edit mode moves focus to the root,
            // which blurs the input and fires this. The press commits the
            // stepped value; committing the draft too would overwrite it and
            // push a second undo step.
            if (isPressing()) return;
            if (modeRef.current !== 'editing') return;
            const { min, max } = cbRef.current;
            const parsed = parseTimeInput(draftRef.current, valueRef.current);
            closeEditor();
            if (parsed !== null) {
                // A text commit is one `onChange` + one `onRelease`, not an
                // announced run: nothing previewed, the parent commits from
                // its committed value.
                run.begin('keys', false);
                run.update(clampMs(parsed, min, max));
                run.end();
            }
            if (refocus) rootRef.current?.focus();
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isPressing, closeEditor],
    );

    const onEditKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closeEditor();
                rootRef.current?.focus();
            }
            // Other keys (arrows, digits) belong to the text input; stop them
            // from reaching the root's segment handlers.
            e.stopPropagation();
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [commitEdit, closeEditor],
    );

    return { openEditor, commitEdit, onEditKeyDown };
}
