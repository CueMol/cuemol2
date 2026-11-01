/**
 * @file plugins/getpdb/renderer/pdbIdHistory.ts
 * @description localStorage-backed input history for the Get PDB dialog:
 * the IDs that were downloaded and the keywords that were searched for, in
 * one list, most recent first. Mirrors UXP `util.History` semantics (LRU,
 * deduplicated, capped), and patterns selHistory.ts in h3-kit/MolSelList/.
 *
 * An accession code is stored in its canonical form (`parseAccession`: PDB
 * IDs lowercase, EMDB IDs `EMD-<num>`), so `1MBN` and `1mbn` are one entry;
 * keywords are stored as typed, with the whitespace collapsed. Reads apply
 * the same check as pushes, so corrupted storage cannot surface a blank or
 * oversized entry in the picker. Built on the shared
 * `createLruStringHistory` factory.
 */

import { parseAccession } from '@renderer/worker/shared/pdbUrls';
import { createLruStringHistory } from '@renderer/utils/createLruStringHistory';

export const STORAGE_KEY = 'cuemol.getPdbDialog.history';
export const MAX_ENTRIES = 20;

/** Longest keyword string kept; anything longer is not a search someone repeats. */
export const MAX_ENTRY_LENGTH = 200;

/** The canonical form of an ID, or the keywords with their whitespace collapsed. */
function normalize(v: string): string {
    const t = v.trim().replace(/\s+/g, ' ');
    return parseAccession(t)?.id ?? t;
}

function isStorable(v: string): boolean {
    return v.length > 0 && v.length <= MAX_ENTRY_LENGTH;
}

const store = createLruStringHistory({
    key: STORAGE_KEY,
    max: MAX_ENTRIES,
    normalize,
    guard: isStorable,
    readGuard: isStorable,
});

export const getHistory = store.getHistory;
export const pushHistory = store.pushHistory;
export const clearHistory = store.clearHistory;
