/**
 * @file worker/server/catalog/errors.ts
 * @description The failures many ops report, worded once.
 *
 * A model reads these to decide its next call, so the same fault reads the
 * same way whichever op met it.
 */

import type { OpOutcome } from './op'

export const NO_OBJECT = 'No object with that id in this scene.'
export const NO_RENDERER = 'No renderer with that id in this scene.'
export const NO_NODE = 'No node with that id and type in this scene.'
export const NO_MOLECULE = 'No molecule with that id in this scene.'
export const VIEW_UNREADABLE = 'The view could not be read.'

/**
 * A failed service result as an op's failure: the service's own message, or
 * `fallback` when it gave none. For a failure met part-way through an op;
 * a service result that is the op's whole answer goes through
 * `normalizeServiceResult`.
 */
export function failedWith(res: { error?: string }, fallback: string): OpOutcome {
  return { ok: false, error: res.error || fallback }
}
