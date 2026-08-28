/**
 * @file __test__/scenePaneRenameKeys.test.tsx
 * @description Pins that the scene tree stops acting on keystrokes while the
 * inline rename editor is open.
 *
 * The tree binds Delete / Backspace (bulk delete) and F2 (begin rename) on the
 * scrolling wrapper. The rename editor is an ordinary `<input>` rendered inside
 * that wrapper, so every keystroke typed into it bubbles to the same handler.
 * Before this was guarded, pressing Backspace to correct a typo in a node name
 * called `onDeleteSelected` and removed the node from the scene -- and, because
 * the handler also called preventDefault, the character was not even deleted.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from './helpers/testHarness'
import { ScenePane } from '../components/panes/ScenePane'
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

const tree = (): SceneTreeNode =>
  mkNode({
    id: 0,
    type: 'scene',
    children: [
      mkNode({ id: 1, type: 'object', className: 'PDBMol', children: [] }),
    ],
  })

interface Mounted {
  container: HTMLElement
  unmount: () => void
  onDeleteSelected: ReturnType<typeof vi.fn>
  onBeginInlineRename: ReturnType<typeof vi.fn>
}

function mount(editingNodeId: string | null): Mounted {
  const onDeleteSelected = vi.fn()
  const onBeginInlineRename = vi.fn()
  const { container, unmount } = mountTree(
    <ScenePane
      tree={tree()}
      selectedId="1"
      selectedIds={new Set(['1'])}
      onSelect={() => {}}
      onToggleVisibility={() => {}}
      onMoveNode={() => {}}
      onDeleteSelected={onDeleteSelected}
      onBeginInlineRename={onBeginInlineRename}
      editingNodeId={editingNodeId}
    />,
  )
  return { container, unmount, onDeleteSelected, onBeginInlineRename }
}

/** Dispatch a bubbling keydown from inside the tree's scrolling wrapper. */
function pressKey(container: HTMLElement, key: string): void {
  const scroll = container.querySelector('.sp-pane-scroll')
  if (!scroll) throw new Error('scene tree scroll wrapper not rendered')
  // The rename editor lives inside the wrapper, so a key typed into it
  // reaches the wrapper's handler exactly like this.
  const target = (scroll.querySelector('input') ?? scroll) as HTMLElement
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('ScenePane keyboard handling vs the inline rename editor', () => {
  it.each(['Backspace', 'Delete'])(
    'does not delete the node when %s is pressed while renaming',
    (key) => {
      const m = mount('1')
      pressKey(m.container, key)
      expect(m.onDeleteSelected).not.toHaveBeenCalled()
      m.unmount()
    },
  )

  it('does not restart the rename when F2 is pressed while renaming', () => {
    const m = mount('1')
    pressKey(m.container, 'F2')
    expect(m.onBeginInlineRename).not.toHaveBeenCalled()
    m.unmount()
  })

  it.each(['Backspace', 'Delete'])(
    'still deletes the selection when %s is pressed and nothing is being renamed',
    (key) => {
      const m = mount(null)
      pressKey(m.container, key)
      expect(m.onDeleteSelected).toHaveBeenCalledWith('1')
      m.unmount()
    },
  )

  it('still begins a rename on F2 when nothing is being renamed', () => {
    const m = mount(null)
    pressKey(m.container, 'F2')
    expect(m.onBeginInlineRename).toHaveBeenCalledWith('1')
    m.unmount()
  })
})
