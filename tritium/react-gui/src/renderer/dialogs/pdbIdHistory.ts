/**
 * @file pdbIdHistory.ts
 * @description localStorage-backed PDB ID input history for the Get PDB
 * dialog. Mirrors UXP `util.History` semantics (LRU, deduplicated, capped),
 * and patterns selHistory.ts in h3-kit/MolSelList/.
 *
 * IDs are normalized to lowercase. Reads validate against the PDB ID regex
 * so corrupted storage (or mixed entries from another app version) cannot
 * surface garbage in the picker. Built on the shared
 * `createLruStringHistory` factory.
 */

import { createLruStringHistory } from '@renderer/utils/createLruStringHistory';

export const STORAGE_KEY = 'cuemol.getPdbDialog.history';
export const MAX_ENTRIES = 20;

// Same shape as UXP openPDB.js:104-111 -- first char digit, remaining alnum.
const PDBID_RE = /^[0-9][0-9a-z]{3}$/i;

const store = createLruStringHistory({
    key: STORAGE_KEY,
    max: MAX_ENTRIES,
    normalize: (v) => v.trim().toLowerCase(),
    guard: (v) => PDBID_RE.test(v),
    readGuard: (v) => PDBID_RE.test(v),
});

export const getHistory = store.getHistory;
export const pushHistory = store.pushHistory;
export const clearHistory = store.clearHistory;
