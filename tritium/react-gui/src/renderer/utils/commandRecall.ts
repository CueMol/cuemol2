/**
 * @file renderer/utils/commandRecall.ts
 * @description How the arrow keys walk back through what was typed before.
 *
 * Readline's rules, as pure functions: going up walks into the past, going
 * down walks back out, and the draft you had typed is waiting at the bottom.
 * Any input line that keeps a history behaves this way -- the AI agent's
 * composer and the PyMOL console prompt both do -- and the rules are worth
 * having in one place because the off-by-one at each end is the whole of it.
 *
 * Storage is the caller's: pass the list in. `createLruStringHistory` is the
 * usual source, with each consumer owning its own key and cap.
 *
 * No DOM and no React, so a test reads them directly.
 */

/**
 * Where in the history the input currently is.
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
 * Step one entry further back.
 *
 * @param draft - what is in the input now; stashed on the first step so the
 *   user can come back down to it.
 * @param history - newest first.
 * @returns null when there is nothing older to show, so the caller can leave
 *   the keystroke to the field.
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
 * Step one entry forward, and off the end back to the stashed draft.
 *
 * @returns null when not browsing, so Down keeps its usual meaning in the
 *   field until the user has actually gone up.
 */
export function recallDown(state: RecallState, history: readonly string[]): RecallStep | null {
  if (state.index === null) return null
  const next = state.index - 1
  if (next < 0) return { state: IDLE, draft: state.stashedDraft }
  return { state: { ...state, index: next }, draft: history[next] ?? '' }
}
