/**
 * @file h3-kit/MolSelList/selHistory.ts
 * @description localStorage-backed atom-selection history shared by MolSelList instances.
 *
 * Mirrors UXP `util.selHistory` semantics: a single global LRU list, deduplicated,
 * with `*` / `none` / empty values excluded. Built on the shared
 * `createLruStringHistory` factory.
 *
 * Recording is the caller's job, and the rule is "every selection a user
 * action applied": a host that knows the expression pushes it once the write
 * succeeded, and a worker service that builds the expression itself returns
 * it as `selStr` (or `selStrs` for a multi-object rectangle / lasso pick) for
 * `recordAppliedSel`. A run of incremental picks (sequence-panel residue
 * clicks, 3D-view double-click toggles) goes through `recordIncrementalSel`,
 * which keeps only the run's latest state. The SelectionPane builder ops are
 * deliberately not recorded.
 */

import { createLruStringHistory } from '@renderer/utils/createLruStringHistory';

export const STORAGE_KEY = 'cuemol.molSelList.history';
export const MAX_ENTRIES = 100;

const SKIP = new Set(['', '*', 'none']);

const store = createLruStringHistory({
    key: STORAGE_KEY,
    max: MAX_ENTRIES,
    guard: (v) => !SKIP.has(v),
});

export const getHistory = store.getHistory;
export const pushHistory = store.pushHistory;

// The entry the last incremental pick wrote, so the next pick of the run can
// replace it. Module state: every incremental source shares one run.
let lastIncremental: string | undefined;

export function clearHistory(): void {
    lastIncremental = undefined;
    store.clearHistory();
}

/**
 * Record the result of an incremental pick (a residue click / drag in the
 * sequence panel, a double-click in the 3D view). Each pick applies the whole
 * `mol.sel`, so a run of picks reads as one selection: when the previous
 * pick's entry is still the most recent one it is replaced, and only the
 * run's final state remains. Anything recorded in between (another surface,
 * a hand-typed apply) ends the run. A value the push guard drops (`''`,
 * `*`, `none`) records nothing and leaves the previous entry in place.
 *
 * @param selStr - the selection applied by the pick
 */
export function recordIncrementalSel(selStr: string): void {
    const next = selStr.trim();
    if (SKIP.has(next)) return;
    if (lastIncremental !== undefined && lastIncremental !== next) {
        const head = getHistory()[0];
        if (head === lastIncremental) store.removeHistory(lastIncremental);
    }
    pushHistory(next);
    lastIncremental = next;
}

/** Result shape of a worker service that applied a selection it built itself. */
export interface AppliedSelResult {
    ok: boolean;
    /** The expression the service applied (single target). */
    selStr?: string;
    /** One expression per updated object (rectangle / lasso pick). */
    selStrs?: string[];
}

/**
 * Record the selection(s) a service applied. A failed service, or a result
 * without an expression, records nothing; the push guard still drops
 * `*` / `none` / empty.
 *
 * @param res - the service result (undefined when the call itself failed)
 */
export function recordAppliedSel(res: AppliedSelResult | null | undefined): void {
    if (!res?.ok) return;
    if (res.selStr !== undefined) pushHistory(res.selStr);
    if (res.selStrs) for (const s of res.selStrs) pushHistory(s);
}
