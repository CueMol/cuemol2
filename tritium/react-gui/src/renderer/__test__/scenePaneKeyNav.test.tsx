/**
 * @file __test__/scenePaneKeyNav.test.tsx
 * @description Arrow-key navigation of the scene tree.
 *
 * The movement itself is h3-kit's (`useListKeyNav`, tested there). What this
 * file pins is the part only ScenePane knows: the tree navigates the rows as
 * DRAWN, so a collapsed subtree's children are skipped, and the tree's own
 * keys (F2, Delete) still work around it.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
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
    name: `node${p.id}`, className: '', visible: true, locked: false,
    uiCollapsed: false, uiOrder: 0, effectiveVisible: true, children: [], ...p,
  }
}

/**
 * scene 0
 *  - object 1 (expanded)      -> renderer 11, renderer 12
 *  - object 2 (collapsed)     -> renderer 21 (not drawn)
 * Visible order: 0, 1, 11, 12, 2
 */
const tree = (): SceneTreeNode =>
  mkNode({
    id: 0, type: 'scene', children: [
      mkNode({
        id: 1, type: 'object', className: 'PDBMol', children: [
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

interface Mounted {
  container: HTMLElement
  unmount: () => void
  onSelect: ReturnType<typeof vi.fn>
  onSelectRange: ReturnType<typeof vi.fn>
  onDeleteSelected: ReturnType<typeof vi.fn>
  onNodeExpandChange: ReturnType<typeof vi.fn>
}

function mount(selectedId: string, editingNodeId: string | null = null): Mounted {
  const onSelect = vi.fn()
  const onSelectRange = vi.fn()
  const onDeleteSelected = vi.fn()
  const onNodeExpandChange = vi.fn()
  const { container, unmount } = mountTree(
    withSceneTree({ tree: tree(), selectedId: selectedId, selectedIds: selectedId ? new Set([selectedId]) : new Set(), onSelect: onSelect, onSelectRange: onSelectRange, onToggleVisibility: () => {}, onMoveNode: () => {}, onDeleteSelected: onDeleteSelected, onNodeExpandChange: onNodeExpandChange, editingNodeId: editingNodeId }, <ScenePane />),
  )
  return { container, unmount, onSelect, onSelectRange, onDeleteSelected, onNodeExpandChange }
}

/**
 * The scrolling wrapper is where the tree binds its keydown. Wrapped in
 * `act` because expand / collapse are state updates the assertions read back
 * out of the DOM.
 */
function press(container: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  const wrap = container.querySelector('.sp-pane-scroll')
  if (!wrap) throw new Error('tree wrapper not rendered')
  act(() => {
    wrap.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  })
}

describe('ScenePane keyboard navigation', () => {
  it('moves down and up through the rows as drawn', () => {
    const m = mount('11')
    press(m.container, 'ArrowDown')
    expect(m.onSelect).toHaveBeenLastCalledWith('12')
    m.unmount()

    const up = mount('11')
    press(up.container, 'ArrowUp')
    expect(up.onSelect).toHaveBeenLastCalledWith('1')
    up.unmount()
  })

  it('skips a collapsed subtree, matching what is on screen', () => {
    // 12 -> 2, never 21: object 2 is collapsed so its child is not drawn.
    const m = mount('12')
    press(m.container, 'ArrowDown')
    expect(m.onSelect).toHaveBeenLastCalledWith('2')
    m.unmount()
  })

  it('jumps to the ends with Home / End', () => {
    const m = mount('11')
    press(m.container, 'Home')
    expect(m.onSelect).toHaveBeenLastCalledWith('0')
    press(m.container, 'End')
    expect(m.onSelect).toHaveBeenLastCalledWith('2')
    m.unmount()
  })

  it('extends the selection with Shift', () => {
    const m = mount('11')
    press(m.container, 'ArrowDown', { shiftKey: true })
    expect(m.onSelectRange).toHaveBeenCalledWith('12', ['0', '1', '11', '12', '2'], false)
    expect(m.onSelect).not.toHaveBeenCalled()
    m.unmount()
  })

  it('Right opens a closed row, then steps into it', () => {
    // Object 2 starts collapsed, so its child is not drawn.
    const m = mount('2')
    expect(m.container.querySelector('[data-node-id="21"]')).toBeNull()

    press(m.container, 'ArrowRight')
    // Opened: the child is drawn and the change is reported for persistence.
    expect(m.container.querySelector('[data-node-id="21"]')).not.toBeNull()
    expect(m.onNodeExpandChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }), false,
    )
    expect(m.onSelect).not.toHaveBeenCalled()

    // Already open: the next Right moves onto the first child.
    press(m.container, 'ArrowRight')
    expect(m.onSelect).toHaveBeenLastCalledWith('21')
    m.unmount()
  })

  it('Left closes an open row, then steps out to the parent', () => {
    const m = mount('1')
    press(m.container, 'ArrowLeft')
    // Asserted through the expand callback rather than the DOM: Blueprint's
    // Collapse keeps children mounted through its closing transition, which
    // never finishes under jsdom.
    expect(m.onNodeExpandChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }), true,
    )
    expect(m.onSelect).not.toHaveBeenCalled()

    // Closed now: the next Left goes out to the parent.
    press(m.container, 'ArrowLeft')
    expect(m.onSelect).toHaveBeenLastCalledWith('0')
    m.unmount()
  })

  it('Left on a leaf goes straight to its parent', () => {
    const m = mount('11')
    press(m.container, 'ArrowLeft')
    expect(m.onSelect).toHaveBeenLastCalledWith('1')
    m.unmount()
  })

  it('leaves Delete to the tree', () => {
    const m = mount('11')
    press(m.container, 'Delete')
    expect(m.onDeleteSelected).toHaveBeenCalledWith('11')
    expect(m.onSelect).not.toHaveBeenCalled()
    m.unmount()
  })

  it('stays out of the way while a row is being renamed', () => {
    const m = mount('11', '11')
    press(m.container, 'ArrowDown')
    expect(m.onSelect).not.toHaveBeenCalled()
    m.unmount()
  })
})
