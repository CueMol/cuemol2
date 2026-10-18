/**
 * @file plugins/console/renderer/commandHistory.ts
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
import type { LruStringHistory } from '@renderer/utils/createLruStringHistory'
import type { DialectId } from '../shared/consoleTypes'

/**
 * Where each dialect's command lines live. The PyMOL one keeps the key it had
 * before the console spoke more than one language, so its history survived.
 */
export const STORAGE_KEYS: Readonly<Record<DialectId, string>> = {
  native: 'cuemol.console.history.native',
  pymol: 'cuemol.pymconsole.history',
}

/**
 * How many to keep.
 *
 * Larger than the agent's 50: console lines are short, often come in runs
 * that belong together, and walking back to the start of a session is a
 * normal thing to do.
 */
export const MAX_ENTRIES = 100

const stores = {
  native: createLruStringHistory({ key: STORAGE_KEYS.native, max: MAX_ENTRIES }),
  pymol: createLruStringHistory({ key: STORAGE_KEYS.pymol, max: MAX_ENTRIES }),
}

/**
 * One dialect's history. Kept apart because a line in one language is
 * rarely valid in the other, and recalling it would only produce an error.
 */
export function historyOf(dialect: DialectId): LruStringHistory {
  return stores[dialect]
}
