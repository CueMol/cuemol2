/**
 * @file utils/createStringPref.ts
 * @description Factory for a localStorage-backed single remembered string
 * (e.g. "last used file path"). Mirrors UXP `pref.get/set` semantics: a
 * defensive read returns `undefined` for a missing / corrupt / non-string
 * payload, and an empty set is ignored so a blank value cannot clobber a
 * previously remembered one.
 */

import { loadJSON, saveJSON } from './localStorageJSON';

export interface StringPrefOptions {
    /** localStorage key holding the JSON-encoded string. */
    key: string;
}

/** Public surface returned by {@link createStringPref}. */
export interface StringPref {
    get(): string | undefined;
    set(value: string): void;
}

function asString(raw: unknown): string | null {
    return typeof raw === 'string' ? raw : null;
}

/**
 * Build a single-string preference store bound to a localStorage key.
 *
 * @param options - storage key.
 * @returns get (undefined when unset / empty / corrupt) and set (ignores empty).
 */
export function createStringPref(options: StringPrefOptions): StringPref {
    const { key } = options;

    function get(): string | undefined {
        const v = loadJSON<string | null>(key, asString, null);
        return v && v.length > 0 ? v : undefined;
    }

    function set(value: string): void {
        if (!value) return;
        saveJSON(key, value);
    }

    return { get, set };
}
