/**
 * @file __test__/scenePaneRangeSelect.test.tsx
 * @description Pins the Shift+click wiring of the scene tree.
 *
 * The range itself is computed in `useSceneTree.selectRangeTo` (covered in
 * useSceneTree.test.tsx). What this file pins is the part that only ScenePane
 * knows: which rows are *visible*, and in what order. Shift ranges over the
 * drawn rows, so a collapsed subtree's children must not appear in the list
 * handed to the hook -- otherwise the range would silently include rows the
 * user cannot see.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from './helpers/testHarness'
import { ScenePane } from '../components/panes/ScenePane'
import { withSceneTree } from './helpers/sceneTreeEnv'

// ScenePane reads the tree and its actions from the provider; stand it in.
vi.mock('../state/sceneTree', async () => (await import('./helpers/sceneTreeEnv')).mockSceneTreeModule())
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes'

void React

function mkNode(
  p: Partial<SceneTreeNode> & { id: number; type: SceneTreeNode['type'] },
): SceneTreeNode {
  return {
    name: `node${p.id}`,
    className: '',
    visible: true,
    locked: false,
    uiCollapsed: false,
    uiOrder: 0,
    effectiveVisible: true,
    children: [],
    ...p,
  }
}

/**
 * scene 0
 *  - object 1 (expanded)
 *     - renderer 11
 *     - renderer 12
 *  - object 2 (collapsed -- its child must stay out of the visible order)
 *     - renderer 21
 */
const tree = (): SceneTreeNode =>
  mkNode({
    id: 0,
    type: 'scene',
    children: [
      mkNode({
        id: 1, type: 'object', className: 'PDBMol',
        children: [
          mkNode({ id: 11, type: 'renderer' }),
          mkNode({ id: 12, type: 'renderer' }),
        ],
      }),
      mkNode({
        id: 2, type: 'object', className: 'PDBMol', uiCollapsed: true,
        children: [mkNode({ id: 21, type: 'renderer' })],
      }),
    ],
  })

/** The label span carrying `data-node-id` is what receives the click. */
function rowLabel(container: HTMLElement, id: number): HTMLElement {
  const el = container.querySelector(`[data-node-id="${id}"]`)
  if (!el) throw new Error(`row ${id} not rendered`)
  return el as HTMLElement
}

function click(el: HTMLElement, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }))
}

interface Mounted {
  container: HTMLElement
  unmount: () => void
  onSelectRange: ReturnType<typeof vi.fn>
  onToggleSelect: ReturnType<typeof vi.fn>
  onSelect: ReturnType<typeof vi.fn>
}

function mount(selectedId: string): Mounted {
  const onSelectRange = vi.fn()
  const onToggleSelect = vi.fn()
  const onSelect = vi.fn()
  const { container, unmount } = mountTree(
    withSceneTree({ tree: tree(), selectedId: selectedId, selectedIds: selectedId ? new Set([selectedId]) : new Set(), onSelect: onSelect, onToggleSelect: onToggleSelect, onSelectRange: onSelectRange, onToggleVisibility: () => {}, onMoveNode: () => {} }, <ScenePane />),
  )
  return { container, unmount, onSelectRange, onToggleSelect, onSelect }
}

describe('ScenePane Shift+click range select', () => {
  it('hands the hook the clicked id and the visible rows in display order', () => {
    const m = mount('1')
    click(rowLabel(m.container, 12), { shiftKey: true })

    expect(m.onSelectRange).toHaveBeenCalledTimes(1)
    const [id, visible, additive] = m.onSelectRange.mock.calls[0]
    expect(id).toBe('12')
    expect(additive).toBe(false)
    // Depth-first display order; 21 is absent because object 2 is collapsed.
    expect(visible).toEqual(['0', '1', '11', '12', '2'])
    expect(m.onSelect).not.toHaveBeenCalled()
    m.unmount()
  })

  it('passes additive=true for Shift+Cmd / Shift+Ctrl', () => {
    for (const mod of ['metaKey', 'ctrlKey'] as const) {
      const m = mount('1')
      click(rowLabel(m.container, 12), { shiftKey: true, [mod]: true })
      expect(m.onSelectRange.mock.calls[0][2]).toBe(true)
      // The plain Cmd-click toggle must not also fire.
      expect(m.onToggleSelect).not.toHaveBeenCalled()
      m.unmount()
    }
  })

  it('falls back to a plain select when there is no anchor yet', () => {
    const m = mount('')
    click(rowLabel(m.container, 12), { shiftKey: true })
    expect(m.onSelectRange).not.toHaveBeenCalled()
    expect(m.onSelect).toHaveBeenCalledWith('12')
    m.unmount()
  })

  it('falls back to a plain select when the anchor row is not visible', () => {
    // Anchor 21 lives under the collapsed object 2, so the range has no
    // meaningful endpoints on screen.
    const m = mount('21')
    click(rowLabel(m.container, 12), { shiftKey: true })
    expect(m.onSelectRange).not.toHaveBeenCalled()
    expect(m.onSelect).toHaveBeenCalledWith('12')
    m.unmount()
  })

  it('leaves the plain Cmd-click toggle path untouched', () => {
    const m = mount('1')
    click(rowLabel(m.container, 12), { metaKey: true })
    expect(m.onToggleSelect).toHaveBeenCalledWith('12')
    expect(m.onSelectRange).not.toHaveBeenCalled()
    m.unmount()
  })
})
