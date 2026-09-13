/**
 * @file plugins/pymconsole/renderer/commandHistory.ts
 * @description The command lines the user has submitted.
 *
 * A console without history is unusable -- fixing a typo in a long `load`
 * line by retyping it is the thing people stop using a console over. Kept in
 * localStorage so it survives a restart.
 *
 * The arrow-key rules are shared (`@renderer/utils/commandRecall`); what is
 * owned here is the key and the cap.
 */

import { createLruStringHistory } from '@renderer/utils/createLruStringHistory'

/** Where the command lines live. */
export const STORAGE_KEY = 'cuemol.pymconsole.history'

/**
 * How many to keep.
 *
 * Larger than the agent's 50: console lines are short, often come in runs
 * that belong together, and walking back to the start of a session is a
 * normal thing to do.
 */
export const MAX_ENTRIES = 100

const store = createLruStringHistory({ key: STORAGE_KEY, max: MAX_ENTRIES })

/** Newest first. */
export const getHistory = store.getHistory
/** Record a submitted line. A repeat moves to the front rather than duplicating. */
export const pushHistory = store.pushHistory
export const clearHistory = store.clearHistory
