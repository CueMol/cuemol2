/**
 * @file h3-kit/form/TextAreaField.test.tsx
 * @description When Enter sends and when it does not.
 *
 * The case worth pinning is the IME one: while an input method is composing,
 * Enter confirms a candidate and must not send. Getting this wrong makes the
 * field unusable in Japanese, Chinese and Korean while looking perfectly fine
 * to anyone testing in English -- which is exactly how it shipped.
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
  it('sends on a plain Enter but never on one an IME is using', () => {
    const onSubmit = vi.fn()
    const { container, unmount } = mountTree(
      <TextAreaField value="こんにちは" onChange={() => undefined} onSubmit={onSubmit} />,
    )

    // The Enter that confirms a kana-to-kanji conversion.
    pressEnter(container, { isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()

    // The same key on a host that reports only the legacy sentinel.
    pressEnter(container, { keyCode: 229 })
    expect(onSubmit).not.toHaveBeenCalled()

    // Shift+Enter is a newline, so the textarea keeps it.
    const shifted = pressEnter(container, { shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(shifted.defaultPrevented).toBe(false)

    // A plain Enter, composition finished: send, and do not also insert a
    // newline into the message being sent.
    const plain = pressEnter(container)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(plain.defaultPrevented).toBe(true)

    unmount()
  })
})
