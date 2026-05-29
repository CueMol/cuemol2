/**
 * @file coordPathHistory.ts
 * @description localStorage-backed "last used AMBER coordinate path" for the
 * AMBER prmtop file-open dialog. Analogous to psfPathHistory (NAMD), so
 * reopening the dialog defaults to the most recently chosen inpcrd / rst7 /
 * restrt file.
 *
 * Reads are defensive: a missing / corrupt / non-string payload returns
 * `undefined` rather than throwing.
 */

import { loadJSON, saveJSON } from '../../utils/localStorageJSON';

export const STORAGE_KEY = 'cuemol.fopenOptions.amberCoordPath';

function asString(raw: unknown): string | null {
    return typeof raw === 'string' ? raw : null;
}

export function getLastCoordPath(): string | undefined {
    const v = loadJSON<string | null>(STORAGE_KEY, asString, null);
    return v && v.length > 0 ? v : undefined;
}

export function setLastCoordPath(path: string): void {
    if (!path) return;
    saveJSON(STORAGE_KEY, path);
}
