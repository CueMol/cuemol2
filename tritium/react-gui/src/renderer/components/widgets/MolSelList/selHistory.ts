/**
 * @file selHistory.ts
 * @description localStorage-backed atom-selection history shared by MolSelList instances.
 *
 * Mirrors UXP `util.selHistory` semantics: a single global LRU list, deduplicated,
 * with `*` / `none` / empty values excluded.
 */

export const STORAGE_KEY = 'cuemol.molSelList.history';
export const MAX_ENTRIES = 20;

const SKIP = new Set(['', '*', 'none']);

function isStorageAvailable(): boolean {
    return typeof globalThis !== 'undefined' && !!globalThis.localStorage;
}

export function getHistory(): string[] {
    if (!isStorageAvailable()) return [];
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
        return [];
    }
}

export function pushHistory(value: string): void {
    if (!isStorageAvailable()) return;
    const trimmed = value.trim();
    if (SKIP.has(trimmed)) return;
    const current = getHistory().filter((v) => v !== trimmed);
    current.unshift(trimmed);
    if (current.length > MAX_ENTRIES) current.length = MAX_ENTRIES;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export function clearHistory(): void {
    if (!isStorageAvailable()) return;
    globalThis.localStorage.removeItem(STORAGE_KEY);
}
