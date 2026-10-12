/**
 * @file renderer/__test__/truncatedText.test.tsx
 * @description `TruncatedText` expands only a label that is cut, and drops
 * the expansion as soon as the row is acted on.
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import { TruncatedText } from '@renderer/h3-kit/list'

void React

/** Give the label a cut (or uncut) width; jsdom has no layout. */
function sized(el: HTMLElement, scroll: number, client: number): void {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scroll })
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: client })
}

const tip = () => document.body.querySelector('.h3-expansion-tip')

describe('TruncatedText', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the whole line over a cut label after a hover, and hides it on a press', () => {
    vi.useFakeTimers()
    const { container } = mountTree(<TruncatedText text="Set coil.width = 0.2 on 1OX1/ribbon1" />)
    const label = container.querySelector('.h3-truncated-text') as HTMLElement

    // Not cut: nothing to expand.
    sized(label, 100, 100)
    act(() => { label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(tip()).toBeNull()
    act(() => { label.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })) })

    sized(label, 240, 100)
    act(() => { label.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    expect(tip()).toBeNull()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(tip()?.textContent).toBe('Set coil.width = 0.2 on 1OX1/ribbon1')

    act(() => { window.dispatchEvent(new MouseEvent('mousedown')) })
    expect(tip()).toBeNull()
  })
})
