/**
 * @file plugins/agent/renderer/promptHistory.ts
 * @description The prompts the user has sent, and how the arrow keys walk
 * back through them.
 *
 * Shell-style recall: the composer is a place people re-run and reword
 * instructions, and retyping the last one because it nearly worked is the
 * common case. Kept in localStorage so it survives a restart, the same way
 * the Get PDB dialog keeps its accession codes.
 *
 * The browsing rules are pure functions rather than component state so they
 * can be read and tested without a DOM. They follow readline: going up walks
 * into the past, going down walks back out, and the draft you had typed is
 * waiting at the bottom.
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

/**
 * Where in the history the composer currently is.
 *
 * `index` is null when the user is writing rather than browsing. While
 * browsing it indexes `history`, newest at 0.
 */
export interface RecallState {
  index: number | null
  /** What was typed before browsing started, returned to at the bottom. */
  stashedDraft: string
}

/** Not browsing. */
export const IDLE: RecallState = { index: null, stashedDraft: '' }

/** A step through the history: the new position and what to show. */
export interface RecallStep {
  state: RecallState
  draft: string
}

/**
 * Step one prompt further back.
 *
 * @param draft - what is in the composer now; stashed on the first step so
 *   the user can come back down to it.
 * @returns null when there is nothing older to show, so the caller can leave
 *   the keystroke to the textarea.
 */
export function recallUp(
  state: RecallState,
  draft: string,
  history: readonly string[],
): RecallStep | null {
  if (history.length === 0) return null
  const next = state.index === null ? 0 : state.index + 1
  if (next >= history.length) return null
  return {
    state: {
      index: next,
      stashedDraft: state.index === null ? draft : state.stashedDraft,
    },
    draft: history[next],
  }
}

/**
 * Step one prompt forward, and off the end back to the stashed draft.
 *
 * @returns null when not browsing, so Down keeps its usual meaning in the
 *   textarea until the user has actually gone up.
 */
export function recallDown(state: RecallState, history: readonly string[]): RecallStep | null {
  if (state.index === null) return null
  const next = state.index - 1
  if (next < 0) return { state: IDLE, draft: state.stashedDraft }
  return { state: { ...state, index: next }, draft: history[next] ?? '' }
}
