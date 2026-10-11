/**
 * @file h3-kit/markdown/MarkdownBlock.test.tsx
 * @description Markdown becomes elements, never markup.
 *
 * Help text comes from op descriptions anyone may edit; drawing it must not
 * be a way to put HTML in the window. A table, the one structure help leans
 * on, has to come out as a table.
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { MarkdownBlock } from './MarkdownBlock'

void React

describe('MarkdownBlock', () => {
  it('draws a table as cells and raw HTML as its text', () => {
    const text = '| Argument | Type |\n|---|---|\n| `zoom` | number |\n\n<script>alert(1)</script> <b>x</b>'
    const { container, unmount } = mountTree(<MarkdownBlock text={text} />)
    const cells = [...container.querySelectorAll('th, td')].map((c) => c.textContent)
    expect(cells).toEqual(['Argument', 'Type', 'zoom', 'number'])
    expect(container.querySelector('td code')?.textContent).toBe('zoom')
    expect(container.querySelector('script, b')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
    unmount()
  })
})
