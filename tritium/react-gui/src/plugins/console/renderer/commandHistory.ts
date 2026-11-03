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
import type { DialectMeta } from '../shared/dialectMeta'

/**
 * How many to keep.
 *
 * Larger than the agent's 50: console lines are short, often come in runs
 * that belong together, and walking back to the start of a session is a
 * normal thing to do.
 */
export const MAX_ENTRIES = 100

const stores = new Map<string, LruStringHistory>()

/**
 * One dialect's history, under the key the dialect declares (`historyKey`).
 * Kept apart because a line in one language is rarely valid in another, and
 * recalling it would only produce an error.
 */
export function historyOf(dialect: DialectMeta): LruStringHistory {
  const key = dialect.historyKey
  let store = stores.get(key)
  if (!store) {
    store = createLruStringHistory({ key, max: MAX_ENTRIES })
    stores.set(key, store)
  }
  return store
}
