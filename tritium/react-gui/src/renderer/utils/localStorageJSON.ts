/**
 * @file utils/localStorageJSON.ts
 * @description Defensive read / write of JSON-encoded values in
 * localStorage. Replaces the inline `isStorageAvailable() + getItem +
 * try/parse + Array.isArray check` boilerplate that several
 * history-store files (rendTypeHistory, pdbIdHistory, selHistory)
 * had duplicated.
 *
 * `loadJSON` returns `fallback` on any failure path: SSR / no storage
 * available, missing key, malformed JSON, or guard rejection. The guard
 * either returns the validated value (possibly a sanitised copy, e.g.
 * filtered array) or `null` to signal mismatch.
 */

function isStorageAvailable(): boolean {
    return typeof globalThis !== 'undefined' && !!globalThis.localStorage;
}

export function loadJSON<T>(
    key: string,
    guard: (raw: unknown) => T | null,
    fallback: T,
): T {
    if (!isStorageAvailable()) return fallback;
    const raw = globalThis.localStorage.getItem(key);
    if (raw === null) return fallback;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return fallback;
    }
    return guard(parsed) ?? fallback;
}

export function saveJSON<T>(key: string, value: T): void {
    if (!isStorageAvailable()) return;
    globalThis.localStorage.setItem(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
    if (!isStorageAvailable()) return;
    globalThis.localStorage.removeItem(key);
}
