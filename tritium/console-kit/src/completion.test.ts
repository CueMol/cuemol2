/**
 * @file completion.test.ts
 * @description Tab's menu as both clients drive it: the grid it walks and
 * the text it stands for.
 */

import { describe, it, expect } from 'vitest'
import { layoutSections, menuText, moveMenu } from './completion'
import type { CompletionCandidate, CompletionMenu } from './completion'

const files = ['a1', 'a2', 'a3', 'a4', 'a5'].map(
  (l): CompletionCandidate => ({ label: l, replacement: `load ${l}`, kind: 'file', group: 'files' }),
)

describe('completion menu', () => {
  it('lays a group out column-major in the width, and walks it as zsh does', () => {
    // Width for two 2-cell columns plus the gap: 5 items -> 3 rows x 2 columns.
    const sections = layoutSections(files, 6)
    expect(sections).toEqual([{ group: 'files', start: 0, count: 5, rows: 3, columns: 2, cellWidth: 2 }])

    let menu: CompletionMenu = { candidates: files, original: 'load a', selected: -1 }
    expect(menuText(menu)).toBe('load a')
    // The first Tab of a listed menu selects the first; Shift-Tab wraps to the last.
    menu = moveMenu(menu, 'next', sections)
    expect(menuText(menu)).toBe('load a1')
    expect(moveMenu(menu, 'prev', sections).selected).toBe(4)
    // Right goes a column over on the same row; on a row whose last column is
    // empty it wraps to the first.
    expect(moveMenu(menu, 'right', sections).selected).toBe(3)
    expect(moveMenu({ ...menu, selected: 2 }, 'right', sections).selected).toBe(2)
    // Down runs on into the next column.
    expect(moveMenu({ ...menu, selected: 2 }, 'down', sections).selected).toBe(3)
  })
})
