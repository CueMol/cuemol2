/**
 * Contract test for collapseSeparators (shared/menuNodes.ts).
 *
 * Menu templates wrap optional groups in separators; when a group is dropped
 * (e.g. an absent paste item), two adjacent separators remain and would
 * render as a double rule. Both render paths (React MenuPanel and the native
 * toElectronTemplate) run the nodes through collapseSeparators, so this pins
 * the normalization they share.
 */
import { describe, it, expect } from 'vitest'
import { collapseSeparators, isSeparatorNode } from '../../shared/menuNodes'
import type { MenuNode } from '../../shared/menuNodes'

const sep: MenuNode<string> = { type: 'separator' }
const item = (label: string): MenuNode<string> => ({ label, action: label })

const labels = (nodes: MenuNode<string>[]) =>
  nodes.map((n) => (isSeparatorNode(n) ? '---' : n.label))

describe('collapseSeparators', () => {
  it('collapses two adjacent separators (the dropped-group case)', () => {
    // colorProofing, sep, (empty paste), sep, property  ->  single rule
    const out = collapseSeparators([item('proof'), sep, sep, item('property')])
    expect(labels(out)).toEqual(['proof', '---', 'property'])
  })

  it('drops leading and trailing separators', () => {
    const out = collapseSeparators([sep, item('a'), sep, item('b'), sep])
    expect(labels(out)).toEqual(['a', '---', 'b'])
  })

  it('collapses a run of three separators to one', () => {
    const out = collapseSeparators([item('a'), sep, sep, sep, item('b')])
    expect(labels(out)).toEqual(['a', '---', 'b'])
  })

  it('leaves a well-formed list unchanged', () => {
    const input = [item('a'), sep, item('b')]
    expect(labels(collapseSeparators(input))).toEqual(['a', '---', 'b'])
  })

  it('returns empty for separators-only input', () => {
    expect(collapseSeparators([sep, sep])).toEqual([])
  })
})
