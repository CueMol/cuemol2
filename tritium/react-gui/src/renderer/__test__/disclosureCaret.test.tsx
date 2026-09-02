import React from 'react'
import { describe, it, expect } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { DisclosureCaret } from '@renderer/h3-kit/primitives'

void React

/**
 * Pins the DisclosureCaret contract every disclosure surface relies on: the
 * expand state is exposed as `data-expanded` (what the tests of those
 * surfaces assert on), a `leaf` keeps the box but draws no glyph, and the
 * consumer's class lands on the same element as the kit's `.h3-caret`.
 */
describe('DisclosureCaret', () => {
  it('exposes the expand state and draws a glyph', () => {
    const { container, unmount } = mountTree(<DisclosureCaret expanded className="x" />)
    const el = container.querySelector('.h3-caret')!
    expect(el.getAttribute('data-expanded')).toBe('true')
    expect(el.classList.contains('x')).toBe(true)
    expect(el.querySelector('svg')).not.toBeNull()
    unmount()
  })

  it('flips to collapsed', () => {
    const { container, unmount } = mountTree(<DisclosureCaret expanded={false} />)
    expect(container.querySelector('.h3-caret')!.getAttribute('data-expanded')).toBe('false')
    unmount()
  })

  it('renders a leaf placeholder with the box but no glyph or state', () => {
    const { container, unmount } = mountTree(<DisclosureCaret expanded leaf />)
    const el = container.querySelector('.h3-caret')!
    expect(el.hasAttribute('data-expanded')).toBe(false)
    expect(el.querySelector('svg')).toBeNull()
    unmount()
  })
})
