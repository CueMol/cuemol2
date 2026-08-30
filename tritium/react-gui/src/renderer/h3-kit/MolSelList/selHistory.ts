/**
 * @file h3-kit/MolSelList/selHistory.ts
 * @description localStorage-backed atom-selection history shared by MolSelList instances.
 *
 * Mirrors UXP `util.selHistory` semantics: a single global LRU list, deduplicated,
 * with `*` / `none` / empty values excluded. Built on the shared
 * `createLruStringHistory` factory.
 */

import { createLruStringHistory } from '@renderer/utils/createLruStringHistory';

export const STORAGE_KEY = 'cuemol.molSelList.history';
export const MAX_ENTRIES = 40;

const SKIP = new Set(['', '*', 'none']);

const store = createLruStringHistory({
    key: STORAGE_KEY,
    max: MAX_ENTRIES,
    guard: (v) => !SKIP.has(v),
});

export const getHistory = store.getHistory;
export const pushHistory = store.pushHistory;
export const clearHistory = store.clearHistory;
