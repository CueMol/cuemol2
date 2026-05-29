/**
 * @file psfPathHistory.ts
 * @description localStorage-backed "last used PSF topology path" for the NAMD
 * coordinate file-open dialog. Mirrors UXP semantics of
 *   pref.get/set("cuemol2.ui.histories.namdcoor.psfpath")
 * so reopening the dialog defaults to the most recently chosen PSF file.
 *
 * Reads are defensive: a missing / corrupt / non-string payload returns
 * `undefined` rather than throwing.
 */

import { loadJSON, saveJSON } from '../../utils/localStorageJSON';

export const STORAGE_KEY = 'cuemol.fopenOptions.namdcoorPsfPath';

function asString(raw: unknown): string | null {
    return typeof raw === 'string' ? raw : null;
}

export function getLastPsfPath(): string | undefined {
    const v = loadJSON<string | null>(STORAGE_KEY, asString, null);
    return v && v.length > 0 ? v : undefined;
}

export function setLastPsfPath(path: string): void {
    if (!path) return;
    saveJSON(STORAGE_KEY, path);
}
