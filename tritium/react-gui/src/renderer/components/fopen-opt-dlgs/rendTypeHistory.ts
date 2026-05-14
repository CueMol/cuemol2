/**
 * @file rendTypeHistory.ts
 * @description localStorage-backed per-objType "last used renderer type" for
 * the file open dialog. Mirrors UXP semantics of
 *   pref.get/set("cuemol2.ui.histories.new_renderer_type" + obj_type)
 * but stored as a single keyed record so it's easy to inspect/clear.
 *
 * Reads are defensive: corrupt JSON, non-object payloads, or non-string
 * values for a key all return `undefined` rather than throwing.
 */

export const STORAGE_KEY = 'cuemol.fopenOptions.rendTypeByObjType';

function isStorageAvailable(): boolean {
    return typeof globalThis !== 'undefined' && !!globalThis.localStorage;
}

function readMap(): Record<string, string> {
    if (!isStorageAvailable()) return {};
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as Record<string, string>;
    } catch {
        return {};
    }
}

export function getDefaultRendType(objType: string): string | undefined {
    if (!objType) return undefined;
    const map = readMap();
    const v = map[objType];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function setDefaultRendType(objType: string, rendType: string): void {
    if (!isStorageAvailable()) return;
    if (!objType || !rendType) return;
    const map = readMap();
    map[objType] = rendType;
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function clearRendTypeHistory(): void {
    if (!isStorageAvailable()) return;
    globalThis.localStorage.removeItem(STORAGE_KEY);
}
