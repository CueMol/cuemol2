/**
 * @file components/widgets/MolSelList/useSelHitCount.ts
 * @description Debounced hit-count resolver for the Selection Builder.
 *
 * Given an injected `getHitCount(selStr)` and an expression, returns the
 * matched-atom count with a loading state the UI can render. The resolver is
 * read-only on the backend (it never assigns mol.sel / opens an undo txn).
 *
 * @module useSelHitCount
 */

import { useEffect, useRef, useState } from 'react';

/** number = count, 'loading' = in flight, null = uncountable, undefined = N/A. */
export type HitCount = number | 'loading' | null | undefined;

/** Backend resolver: expression -> matched-atom count (null on compile fail). */
export type GetHitCount = (selStr: string) => Promise<number | null>;

const DEBOUNCE_MS = 250;

/**
 * Resolve the hit count for `expr`, debounced. Returns `undefined` when no
 * resolver is supplied, the feature is disabled, or the expression is empty.
 *
 * @param getHitCount - injected backend resolver, or undefined to disable
 * @param expr - expression to count, or null when the draft is incomplete
 * @param enabled - gate to skip resolution (e.g. popover closed)
 */
export function useSelHitCount(
    getHitCount: GetHitCount | undefined,
    expr: string | null,
    enabled = true,
): HitCount {
    const [count, setCount] = useState<HitCount>(undefined);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        const trimmed = (expr ?? '').trim();
        if (!getHitCount || !enabled || trimmed === '') {
            setCount(undefined);
            return;
        }
        let cancelled = false;
        setCount('loading');
        timerRef.current = setTimeout(() => {
            getHitCount(trimmed)
                .then((n) => {
                    if (!cancelled) setCount(n);
                })
                .catch(() => {
                    if (!cancelled) setCount(null);
                });
        }, DEBOUNCE_MS);
        return () => {
            cancelled = true;
            if (timerRef.current !== null) clearTimeout(timerRef.current);
        };
    }, [getHitCount, expr, enabled]);

    return count;
}
