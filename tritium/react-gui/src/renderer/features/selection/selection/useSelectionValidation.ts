/**
 * @file features/selection/selection/useSelectionValidation.ts
 * @description Live validity of the selection expression being typed.
 *
 * The field shows an invalid state, so the answer has to be current -- but a
 * selection compiles in C++, and asking on every keystroke would compile a
 * dozen half-written expressions per word. Hence the debounce, and the
 * cancelled flag: a reply that arrives after the text moved on would mark the
 * wrong expression.
 *
 * The empty string, `*` and `none` are answered without asking. They are
 * always valid, and they are what the field holds most of the time.
 */

import { useEffect, useRef, useState } from 'react';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';

/** Wait this long after the last keystroke before compiling. */
export const VALIDATE_DEBOUNCE_MS = 500;

/** Expressions that need no round trip to be known valid. */
const VALIDATE_SKIP = new Set(['', '*', 'none']);

export interface UseSelectionValidationOptions {
    cm: AsyncCueMol | null;
    sceneId: number | undefined;
    /** The text currently in the field. */
    text: string;
}

/**
 * True while the expression is valid (or not worth asking about). Optimistic:
 * a failed round trip reports valid rather than marking a field the user
 * cannot fix.
 */
export function useSelectionValidation({
    cm, sceneId, text,
}: UseSelectionValidationOptions): boolean {
    const [isValid, setIsValid] = useState(true);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!cm || sceneId === undefined) {
            setIsValid(true);
            return;
        }
        if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        const trimmed = text.trim();
        if (VALIDATE_SKIP.has(trimmed)) {
            setIsValid(true);
            return;
        }
        let cancelled = false;
        debounceRef.current = setTimeout(() => {
            cm.invokeService('validateSelection', { selStr: trimmed, sceneId })
                .then((res) => {
                    if (!cancelled) setIsValid(res.ok);
                })
                .catch(() => {
                    if (!cancelled) setIsValid(true);
                });
        }, VALIDATE_DEBOUNCE_MS);
        return () => {
            cancelled = true;
            if (debounceRef.current !== null) clearTimeout(debounceRef.current);
        };
    }, [cm, text, sceneId]);

    return isValid;
}
