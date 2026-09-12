/**
 * @file plugins/agent/renderer/promptHistory.test.ts
 * @description Walking back through sent prompts, readline-style.
 *
 * The rule that is easy to get wrong and annoying to live with: a draft the
 * user was part-way through typing has to come back when they walk out the
 * bottom of the history. Losing it means the arrow key quietly destroys work.
 */

import { describe, it, expect } from 'vitest'
import { IDLE, recallDown, recallUp } from './promptHistory'

/** Newest first, as the store returns them. */
const HISTORY = ['third', 'second', 'first']

describe('walking through sent prompts', () => {
  it('goes back one prompt at a time, and stops at the oldest', () => {
    const up1 = recallUp(IDLE, '', HISTORY)
    expect(up1?.draft).toBe('third')

    const up2 = recallUp(up1!.state, up1!.draft, HISTORY)
    expect(up2?.draft).toBe('second')

    const up3 = recallUp(up2!.state, up2!.draft, HISTORY)
    expect(up3?.draft).toBe('first')

    // Nothing older: the caller leaves the keystroke to the textarea.
    expect(recallUp(up3!.state, up3!.draft, HISTORY)).toBeNull()
  })

  it('brings back the half-written draft on the way out', () => {
    const up = recallUp(IDLE, 'half-written', HISTORY)
    expect(up?.draft).toBe('third')

    const down = recallDown(up!.state, HISTORY)
    expect(down?.draft).toBe('half-written')
    expect(down?.state).toEqual(IDLE)
  })

  it('keeps the stashed draft while walking deeper', () => {
    const up1 = recallUp(IDLE, 'half-written', HISTORY)!
    const up2 = recallUp(up1.state, up1.draft, HISTORY)!
    // The stash is what the user typed, not the prompt shown on the way past.
    expect(up2.state.stashedDraft).toBe('half-written')

    const down1 = recallDown(up2.state, HISTORY)!
    expect(down1.draft).toBe('third')
    expect(recallDown(down1.state, HISTORY)?.draft).toBe('half-written')
  })

  it('does nothing when there is nothing to show', () => {
    expect(recallUp(IDLE, 'typing', [])).toBeNull()
    // Down only means anything once the user has gone up.
    expect(recallDown(IDLE, HISTORY)).toBeNull()
  })
})
