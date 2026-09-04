/**
 * @file utils/createLruStringHistory.ts
 * @description Factory for a localStorage-backed LRU string history (single
 * global list, deduplicated, capped). Mirrors UXP `util.History` semantics
 * and backs the per-feature history modules (selHistory, pdbIdHistory) so
 * the LRU / dedup / cap logic lives in one place.
 *
 * Each consumer supplies its own storage key, cap, an optional `normalize`
 * (canonical form applied before skip / dedup, e.g. trim or lowercase), a
 * `guard` deciding whether a normalized value may be pushed, and an optional
 * `readGuard` filtering corrupt / foreign entries on read. Keeping push and
 * read predicates separate preserves each consumer's exact behavior: some
 * exclude reserved tokens only on push, others validate strictly on both.
 */

import { loadJSON, removeKey, saveJSON } from './localStorageJSON';

export interface LruStringHistoryOptions {
    /** localStorage key holding the JSON-encoded string array. */
    key: string;
    /** Maximum number of retained entries. */
    max: number;
    /**
     * Canonical form applied to a value before guard / dedup checks.
     * Defaults to {@link String.prototype.trim}.
     */
    normalize?: (value: string) => string;
    /**
     * Predicate deciding whether a normalized value may be pushed.
     * Defaults to "non-empty".
     */
    guard?: (value: string) => boolean;
    /**
     * Predicate filtering stored entries on read (defense against corrupt
     * storage or entries from another app version). Defaults to accepting
     * any string, so by default read does not re-apply the push guard.
     */
    readGuard?: (value: string) => boolean;
}

/** Public surface returned by {@link createLruStringHistory}. */
export interface LruStringHistory {
    getHistory(): string[];
    pushHistory(value: string): void;
    /** Drop one entry (normalized match); a no-op when it is absent. */
    removeHistory(value: string): void;
    clearHistory(): void;
}

/**
 * Build an LRU string-history store bound to a localStorage key.
 *
 * @param options - storage key, cap, and optional normalize / guard hooks.
 * @returns getHistory / pushHistory / clearHistory bound to that key.
 */
export function createLruStringHistory(options: LruStringHistoryOptions): LruStringHistory {
    const { key, max } = options;
    const normalize = options.normalize ?? ((v: string) => v.trim());
    const guard = options.guard ?? ((v: string) => v.length > 0);
    const readGuard = options.readGuard ?? (() => true);

    function asStringArray(raw: unknown): string[] | null {
        if (!Array.isArray(raw)) return null;
        return raw.filter((v): v is string => typeof v === 'string' && readGuard(v));
    }

    function getHistory(): string[] {
        return loadJSON(key, asStringArray, []);
    }

    function pushHistory(value: string): void {
        const normalized = normalize(value);
        if (!guard(normalized)) return;
        const current = getHistory().filter((v) => v !== normalized);
        current.unshift(normalized);
        if (current.length > max) current.length = max;
        saveJSON(key, current);
    }

    function removeHistory(value: string): void {
        const normalized = normalize(value);
        const current = getHistory();
        const next = current.filter((v) => v !== normalized);
        if (next.length !== current.length) saveJSON(key, next);
    }

    function clearHistory(): void {
        removeKey(key);
    }

    return { getHistory, pushHistory, removeHistory, clearHistory };
}
