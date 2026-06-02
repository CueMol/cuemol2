/**
 * @file selHistory.ts
 * @description localStorage-backed atom-selection history shared by MolSelList instances.
 *
 * Mirrors UXP `util.selHistory` semantics: a single global LRU list, deduplicated,
 * with `*` / `none` / empty values excluded.
 */

import { loadJSON, removeKey, saveJSON } from '../../utils/localStorageJSON';

export const STORAGE_KEY = 'cuemol.molSelList.history';
export const MAX_ENTRIES = 20;

const SKIP = new Set(['', '*', 'none']);

function asStringArray(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    return raw.filter((v): v is string => typeof v === 'string');
}

export function getHistory(): string[] {
    return loadJSON(STORAGE_KEY, asStringArray, []);
}

export function pushHistory(value: string): void {
    const trimmed = value.trim();
    if (SKIP.has(trimmed)) return;
    const current = getHistory().filter((v) => v !== trimmed);
    current.unshift(trimmed);
    if (current.length > MAX_ENTRIES) current.length = MAX_ENTRIES;
    saveJSON(STORAGE_KEY, current);
}

export function clearHistory(): void {
    removeKey(STORAGE_KEY);
}
