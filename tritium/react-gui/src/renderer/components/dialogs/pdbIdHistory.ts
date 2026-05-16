/**
 * @file pdbIdHistory.ts
 * @description localStorage-backed PDB ID input history for the Get PDB
 * dialog. Mirrors UXP `util.History` semantics (LRU, deduplicated, capped),
 * and patterns selHistory.ts in components/widgets/MolSelList/.
 *
 * IDs are normalized to lowercase. Reads validate against the PDB ID regex
 * so corrupted storage (or mixed entries from another app version) cannot
 * surface garbage in the picker.
 */

import { loadJSON, removeKey, saveJSON } from '../../utils/localStorageJSON';

export const STORAGE_KEY = 'cuemol.getPdbDialog.history';
export const MAX_ENTRIES = 20;

// Same shape as UXP openPDB.js:104-111 — first char digit, remaining alnum.
const PDBID_RE = /^[0-9][0-9a-z]{3}$/i;

function asPdbIdArray(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    return raw.filter((v): v is string => typeof v === 'string' && PDBID_RE.test(v));
}

export function getHistory(): string[] {
    return loadJSON(STORAGE_KEY, asPdbIdArray, []);
}

export function pushHistory(value: string): void {
    const trimmed = value.trim().toLowerCase();
    if (!PDBID_RE.test(trimmed)) return;
    const current = getHistory().filter((v) => v !== trimmed);
    current.unshift(trimmed);
    if (current.length > MAX_ENTRIES) current.length = MAX_ENTRIES;
    saveJSON(STORAGE_KEY, current);
}

export function clearHistory(): void {
    removeKey(STORAGE_KEY);
}
