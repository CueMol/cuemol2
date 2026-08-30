/**
 * @file coordPathHistory.ts
 * @description localStorage-backed "last used AMBER coordinate path" for the
 * AMBER prmtop file-open dialog. Analogous to psfPathHistory (NAMD), so
 * reopening the dialog defaults to the most recently chosen inpcrd / rst7 /
 * restrt file.
 *
 * Reads are defensive: a missing / corrupt / non-string payload returns
 * `undefined` rather than throwing. Built on the shared `createStringPref`
 * factory.
 */

import { createStringPref } from '@renderer/utils/createStringPref';

export const STORAGE_KEY = 'cuemol.fopenOptions.amberCoordPath';

const store = createStringPref({ key: STORAGE_KEY });

export const getLastCoordPath = store.get;
export const setLastCoordPath = store.set;
