/**
 * @file dialogs/fopen-opt-dlgs/rendTypeHistory.ts
 * @description localStorage-backed per-objType "last used renderer type" for
 * the file open dialog. Mirrors UXP semantics of
 *   pref.get/set("cuemol2.ui.histories.new_renderer_type" + obj_type)
 * but stored as a single keyed record so it's easy to inspect/clear.
 *
 * Reads are defensive: corrupt JSON, non-object payloads, or non-string
 * values for a key all return `undefined` rather than throwing.
 */

import { loadJSON, removeKey, saveJSON } from '@renderer/utils/localStorageJSON';

export const STORAGE_KEY = 'cuemol.fopenOptions.rendTypeByObjType';

function asStringMap(raw: unknown): Record<string, string> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, string>;
}

function readMap(): Record<string, string> {
    return loadJSON(STORAGE_KEY, asStringMap, {});
}

export function getDefaultRendType(objType: string): string | undefined {
    if (!objType) return undefined;
    const v = readMap()[objType];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function setDefaultRendType(objType: string, rendType: string): void {
    if (!objType || !rendType) return;
    const map = readMap();
    map[objType] = rendType;
    saveJSON(STORAGE_KEY, map);
}

export function clearRendTypeHistory(): void {
    removeKey(STORAGE_KEY);
}
