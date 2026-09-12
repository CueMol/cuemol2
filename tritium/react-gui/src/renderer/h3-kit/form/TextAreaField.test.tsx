/**
 * @file h3-kit/form/TextAreaField.test.tsx
 * @description When Enter sends and when it does not.
 *
 * Two ways to lose a draft, both pinned here. While an input method is
 * composing, Enter confirms a candidate and must not send -- get that wrong
 * and the field is unusable in Japanese, Chinese and Korean while looking
 * perfectly fine to anyone testing in English, which is exactly how it
 * shipped. And in the default mode Enter belongs to the text, so only a
 * modifier sends.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { TextAreaField } from './TextAreaField'

void React

/** Fire a keydown on the textarea the way the browser would. */
function pressEnter(
  container: HTMLElement,
  init: Partial<KeyboardEventInit> & { keyCode?: number } = {},
): KeyboardEvent {
  const el = container.querySelector('textarea')
  if (!el) throw new Error('no textarea')
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...init,
  })
  // jsdom does not derive keyCode from key, and the legacy IME sentinel is
  // one of the two signals the guard reads.
  if (init.keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { get: () => init.keyCode })
  }
  act(() => { el.dispatchEvent(event) })
  return event
}

describe('TextAreaField Enter handling', () => {
  it('by default keeps Enter for the text and sends on a modifier', () => {
    const onSubmit = vi.fn()
    const { container, unmount } = mountTree(
      <TextAreaField value="ひとつめの行" onChange={() => undefined} onSubmit={onSubmit} />,
    )

    // A bare Enter is a new line: the whole point of the default mode.
    const plain = pressEnter(container)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(plain.defaultPrevented).toBe(false)

    pressEnter(container, { metaKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Either modifier, so a user who learned the other platform's shortcut
    // gets what they meant.
    pressEnter(container, { ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('never sends on an Enter an IME is using, in either mode', () => {
    for (const submitKey of ['enter', 'modifier-enter'] as const) {
      const onSubmit = vi.fn()
      const { container, unmount } = mountTree(
        <TextAreaField
          value="かんじ"
          onChange={() => undefined}
          onSubmit={onSubmit}
          submitKey={submitKey}
        />,
      )

      // The Enter that confirms a kana-to-kanji conversion, as Chromium
      // reports it and as a host that sets only the legacy sentinel does.
      pressEnter(container, { isComposing: true, metaKey: submitKey !== 'enter' })
      pressEnter(container, { keyCode: 229, metaKey: submitKey !== 'enter' })
      expect(onSubmit, submitKey).not.toHaveBeenCalled()

      unmount()
    }
  })

  it('sends on a bare Enter when asked to, keeping Shift+Enter for a new line', () => {
    const onSubmit = vi.fn()
    const { container, unmount } = mountTree(
      <TextAreaField
        value="hello"
        onChange={() => undefined}
        onSubmit={onSubmit}
        submitKey="enter"
      />,
    )

    const shifted = pressEnter(container, { shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(shifted.defaultPrevented).toBe(false)

    // Sending must also swallow the key, or the sent message gains a newline.
    const plain = pressEnter(container)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(plain.defaultPrevented).toBe(true)

    unmount()
  })
})
