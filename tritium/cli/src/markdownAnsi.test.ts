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
    // Framed: a top rule, the head, a rule, the body, a bottom rule.
    const descCol = lines[1].indexOf('Description')
    const body = lines.slice(3, -1)
    expect(body[0].trimStart().slice(1).trimStart().startsWith('slab')).toBe(true)
    // Every body line has its bars where the head has them: the columns stay aligned.
    for (const l of body) expect(l.lastIndexOf('\u2502')).toBe(lines[1].lastIndexOf('\u2502'))
    expect(body.map((l) => l.slice(descCol).replace('\u2502', '').trim()).join(' ')).toBe(long)
  })
})
