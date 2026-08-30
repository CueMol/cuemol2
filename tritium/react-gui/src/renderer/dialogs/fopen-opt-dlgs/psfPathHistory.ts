/**
 * @file psfPathHistory.ts
 * @description localStorage-backed "last used PSF topology path" for the NAMD
 * coordinate file-open dialog. Mirrors UXP semantics of
 *   pref.get/set("cuemol2.ui.histories.namdcoor.psfpath")
 * so reopening the dialog defaults to the most recently chosen PSF file.
 *
 * Reads are defensive: a missing / corrupt / non-string payload returns
 * `undefined` rather than throwing. Built on the shared `createStringPref`
 * factory.
 */

import { createStringPref } from '@renderer/utils/createStringPref';

export const STORAGE_KEY = 'cuemol.fopenOptions.namdcoorPsfPath';

const store = createStringPref({ key: STORAGE_KEY });

export const getLastPsfPath = store.get;
export const setLastPsfPath = store.set;
