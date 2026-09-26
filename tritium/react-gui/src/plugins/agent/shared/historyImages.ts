/**
 * @file plugins/agent/shared/historyImages.ts
 * @description Keeping only the latest pictures of the view in the conversation.
 *
 * The whole conversation is replayed on every turn, so a picture left in it
 * is paid for again on each one -- about a thousand tokens a time, and a few
 * hundred kilobytes held in the panel. An old picture shows a view that no
 * longer exists anyway: the scene snapshot at the head of each turn, and a
 * fresh capture_view, say what is there now.
 *
 * Pure, so the renderer can apply it as it stores the conversation.
 */

import type { ModelMessage } from 'ai'

/** How many of the most recent pictures survive into the next turn. */
export const KEPT_VIEW_IMAGES = 1

/** Stands in for a dropped picture, so the model knows one was there. */
export const DROPPED_IMAGE_NOTE =
  '[An earlier picture of the view was removed to save tokens. Call capture_view to see the view now.]'

type ToolMessage = Extract<ModelMessage, { role: 'tool' }>
type ToolContentPart = ToolMessage['content'][number]

/** Whether a tool-result part carries a picture. */
function hasImage(part: ToolContentPart): boolean {
  return (
    part.type === 'tool-result' &&
    part.output.type === 'content' &&
    part.output.value.some((v) => v.type === 'file')
  )
}

/** The same tool result with its pictures replaced by the note. */
function withoutImage(part: ToolContentPart): ToolContentPart {
  if (part.type !== 'tool-result' || part.output.type !== 'content') return part
  return {
    ...part,
    output: {
      ...part.output,
      value: part.output.value.map((v) =>
        v.type === 'file' ? { type: 'text' as const, text: DROPPED_IMAGE_NOTE } : v,
      ),
    },
  }
}

/**
 * The conversation with all but the last `keep` pictures replaced by a note.
 *
 * Only pictures inside tool results are touched; everything else, including
 * the text of the result that carried a dropped picture, is kept.
 *
 * @returns the input itself when there is nothing to drop.
 */
export function dropStaleImages(
  history: readonly ModelMessage[],
  keep: number = KEPT_VIEW_IMAGES,
): ModelMessage[] {
  let seen = 0
  let changed = false
  // Newest first, so the ones counted before reaching `keep` are the latest.
  const out = [...history].reverse().map((message) => {
    if (message.role !== 'tool') return message
    const content = message.content.map((part) => {
      if (!hasImage(part)) return part
      seen++
      if (seen <= keep) return part
      changed = true
      return withoutImage(part)
    })
    return changed ? { ...message, content } : message
  })
  return changed ? out.reverse() : [...history]
}
