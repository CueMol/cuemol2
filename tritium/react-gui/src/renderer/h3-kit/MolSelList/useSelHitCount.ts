/**
 * @file h3-kit/MolSelList/useSelHitCount.ts
 * @description Debounced hit-count resolver for the Selection Builder.
 *
 * Given an injected `getHitCount(selStr)` and an expression, returns the
 * matched-atom count with a loading state the UI can render. The resolver is
 * read-only on the backend (it never assigns mol.sel / opens an undo txn).
 *
 * @module useSelHitCount
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';

/** number = count, 'loading' = in flight, null = uncountable, undefined = N/A. */
export type HitCount = number | 'loading' | null | undefined;

/** Backend resolver: expression -> matched-atom count (null on compile fail). */
export type GetHitCount = (selStr: string) => Promise<number | null>;

/**
 * Build a stable `getHitCount` resolver bound to a scene + molecule, or
 * `undefined` when either is missing (feature disabled). Shared by the
 * SelectionPane and the MolSelList builder popover so both count atoms the same
 * way via the read-only `getSelHitCount` worker service.
 */
export function useHitCountResolver(
    cm: AsyncCueMol | null,
    sceneID: number | undefined,
    molID: number | undefined,
): GetHitCount | undefined {
    return useMemo(
        () =>
            cm && sceneID !== undefined && molID !== undefined
                ? (selStr: string): Promise<number | null> =>
                      cm
                          .invokeService('getSelHitCount', {
                              sceneId: sceneID,
                              molId: molID,
                              selStr,
                          })
                          .then((r) => r.count)
                : undefined,
        [cm, sceneID, molID],
    );
}

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
