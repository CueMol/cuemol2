/**
 * @file plugins/pymconsole/worker/completion/columns.test.ts
 * @description The shape of a printed candidate list.
 *
 * One rule, and it is the one that is invisible when wrong: the fill is
 * column-major. A row-major version produces the same characters in the same
 * number of lines, so it looks right and reads in the wrong order.
 */

import { describe, it, expect } from 'vitest'
import { formatColumns } from './columns'

describe('formatColumns', () => {
  it('fills down the columns, not across the rows', () => {
    // Names wide enough that only two fit per line, so four of them make two
    // rows. Filled down the columns, the second item starts the second row;
    // filled across, it would sit beside the first.
    const pad = (c: string) => c.repeat(24)
    const lines = formatColumns([pad('a'), pad('b'), pad('c'), pad('d')])
    expect(lines).toHaveLength(2)
    expect(lines[0].trim().split(/\s+/)).toEqual([pad('a'), pad('c')])
    expect(lines[1].trim().split(/\s+/)).toEqual([pad('b'), pad('d')])
  })

  it('gives every candidate one line when they are too wide to share', () => {
    const wide = 'x'.repeat(60)
    expect(formatColumns([wide, wide])).toHaveLength(2)
  })

  it('has nothing to say about an empty list', () => {
    expect(formatColumns([])).toEqual([])
  })
})
