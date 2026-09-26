/**
 * @file plugins/agent/shared/historyImages.test.ts
 * @description Only the latest picture of the view is replayed.
 *
 * Every turn resends the whole conversation, so a picture that survives is
 * paid for again on each one. The note that replaces it has to stay, or the
 * model is left with a result that refers to a picture it cannot see.
 */

import { describe, it, expect } from 'vitest'
import type { ModelMessage } from 'ai'
import { DROPPED_IMAGE_NOTE, dropStaleImages } from './historyImages'

function capture(callId: string): ModelMessage {
  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: callId,
      toolName: 'capture_view',
      output: {
        type: 'content',
        value: [
          { type: 'text', text: '{"ok":true}' },
          { type: 'file', mediaType: 'image/png', data: { type: 'data', data: callId } },
        ],
      },
    }],
  }
}

/** What each capture's result carries, oldest first. */
function carried(history: ModelMessage[]): unknown[][] {
  return history.flatMap((m) =>
    m.role === 'tool'
      ? m.content.flatMap((p) =>
          p.type === 'tool-result' && p.output.type === 'content'
            ? [p.output.value.map((v) => (v.type === 'text' ? v.text : v.type))]
            : [],
        )
      : [],
  )
}

describe('dropping stale pictures from the conversation', () => {
  it('keeps the newest picture and leaves a note where the older ones were', () => {
    const history: ModelMessage[] = [
      capture('c1'),
      { role: 'user', content: 'now make it blue' },
      capture('c2'),
    ]
    expect(carried(dropStaleImages(history))).toEqual([
      ['{"ok":true}', DROPPED_IMAGE_NOTE],
      ['{"ok":true}', 'file'],
    ])
    // Nothing to drop: left as it was.
    expect(dropStaleImages([capture('c1')])).toEqual([capture('c1')])
  })
})
