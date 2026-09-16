/**
 * @file plugins/agent/renderer/promptHistory.ts
 * @description The prompts the user has sent.
 *
 * Shell-style recall: the composer is a place people re-run and reword
 * instructions, and retyping the last one because it nearly worked is the
 * common case. Kept in localStorage so it survives a restart, the same way
 * the Get PDB dialog keeps its accession codes.
 *
 * The browsing rules themselves are shared with any other input line that
 * keeps a history (`@renderer/utils/commandRecall`); what is owned here is
 * the storage key and the cap.
 */

import { createLruStringHistory } from '@renderer/utils/createLruStringHistory'

/** Where the prompts live. */
export const STORAGE_KEY = 'cuemol.agent.promptHistory'

/**
 * How many to keep.
 *
 * Larger than the PDB dialog's 20 because a prompt is worth more to get back
 * than an accession code, and small enough that walking the whole list with
 * the arrow key stays a reasonable thing to do.
 */
export const MAX_ENTRIES = 50

const store = createLruStringHistory({ key: STORAGE_KEY, max: MAX_ENTRIES })

/** Newest first. */
export const getHistory = store.getHistory
/** Record a sent prompt. A repeat moves to the front rather than duplicating. */
export const pushHistory = store.pushHistory
export const clearHistory = store.clearHistory
