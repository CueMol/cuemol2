/**
 * @file plugins/getpdb/renderer/pdbIdHistory.ts
 * @description localStorage-backed PDB ID input history for the Get PDB
 * dialog. Mirrors UXP `util.History` semantics (LRU, deduplicated, capped),
 * and patterns selHistory.ts in h3-kit/MolSelList/.
 *
 * Entries are PDB IDs (lowercase) and EMDB IDs (`EMD-<num>`), normalized
 * by `parseAccession`. Reads validate the same way so corrupted storage (or
 * mixed entries from another app version) cannot surface garbage in the
 * picker. Built on the shared
 * `createLruStringHistory` factory.
 */

import { parseAccession } from '@renderer/worker/shared/pdbUrls';
import { createLruStringHistory } from '@renderer/utils/createLruStringHistory';

export const STORAGE_KEY = 'cuemol.getPdbDialog.history';
export const MAX_ENTRIES = 20;

const store = createLruStringHistory({
    key: STORAGE_KEY,
    max: MAX_ENTRIES,
    normalize: (v) => parseAccession(v)?.id ?? v.trim(),
    guard: (v) => parseAccession(v) !== null,
    readGuard: (v) => parseAccession(v) !== null,
});

export const getHistory = store.getHistory;
export const pushHistory = store.pushHistory;
export const clearHistory = store.clearHistory;
