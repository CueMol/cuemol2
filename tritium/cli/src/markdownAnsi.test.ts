/**
 * @file markdownAnsi.test.ts
 * @description A help table laid out in the terminal's width.
 */

import { describe, it, expect } from 'vitest'
import { displayWidth } from '@cuemol/console-kit'
import { markdownToAnsi } from './markdownAnsi'

describe('markdownToAnsi', () => {
  it('wraps a wide table into the width, keeping every word and the columns aligned', () => {
    const long = 'New slab depth in angstroms; null leaves it as it is now.'
    const md = `| Argument | Default | Description |\n|---|---|---|\n| \`slab\` | optional | ${long} |`
    const lines = markdownToAnsi(md, 40, false)
    expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(40)
    const descCol = lines[0].indexOf('Description')
    const body = lines.slice(2)
    expect(body[0].trimStart().startsWith('slab')).toBe(true)
    expect(body.map((l) => l.slice(descCol).trim()).join(' ')).toBe(long)
  })
})
