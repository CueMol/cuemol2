/**
 * Degrade-detection test for ScenePane drag-and-drop reordering.
 *
 * Pins the wire contract that ADR-0001's hitbox fix restored: a drag
 * starting on one row's label span and dropping on another must reach
 * `onMoveNode` with a resolved `MoveSceneNodeArgs`. Also guards the
 * geometry fix itself — the label span must be a full-cell draggable
 * `block`, not a text-width `inline-block` (the latter left most of the
 * visible row a dead zone, so DnD never fired in-app).
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
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

function makeTree(): SceneTreeNode {
  return mkNode({
    id: 0,
    type: 'scene',
    name: 'Test',
    children: [
      mkNode({ id: 1, type: 'object', name: 'objA', className: 'PDBMol' }),
      mkNode({ id: 2, type: 'object', name: 'objB', className: 'PDBMol' }),
    ],
  })
}

/** Minimal DataTransfer stand-in (jsdom has no usable implementation). */
function makeDataTransfer() {
  const store: Record<string, string> = {}
  return {
    setData: (k: string, v: string) => {
      store[k] = v
    },
    getData: (k: string) => store[k] ?? '',
    get types() {
      return Object.keys(store)
    },
    effectAllowed: '',
    dropEffect: '',
  }
}

function fireDrag(
  el: Element,
  type: string,
  dt: ReturnType<typeof makeDataTransfer>,
  clientY = 0,
): void {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'dataTransfer', { value: dt })
  Object.defineProperty(ev, 'clientY', { value: clientY })
  act(() => {
    el.dispatchEvent(ev)
  })
}

describe('ScenePane drag-and-drop', () => {
  it('fires onMoveNode for an object -> object reorder', () => {
    const onMoveNode = vi.fn()
    const { container, unmount } = mountTree(
      <ScenePane
        tree={makeTree()}
        selectedId=""
        onSelect={() => {}}
        onToggleVisibility={() => {}}
        onMoveNode={onMoveNode}
      />,
    )
    const src = container.querySelector('[data-node-id="1"]')!
    const tgt = container.querySelector('[data-node-id="2"]')!
    expect(src).toBeTruthy()
    expect(tgt).toBeTruthy()

    const dt = makeDataTransfer()
    fireDrag(src, 'dragstart', dt)
    // jsdom getBoundingClientRect is all-zero, so clientY > 0 maps to
    // ori = +1 (drop below the target row).
    fireDrag(tgt, 'dragover', dt, 10)
    // A valid drop position shows the insertion indicator.
    expect(container.querySelector('.sn-drop-line')).toBeTruthy()
    fireDrag(tgt, 'drop', dt, 10)

    expect(onMoveNode).toHaveBeenCalledTimes(1)
    expect(onMoveNode).toHaveBeenCalledWith({
      kind: 'object',
      sourceId: 1,
      targetId: 2,
      ori: 1,
    })
    unmount()
  })

  it('renders the label as a full-cell draggable block', () => {
    const { container, unmount } = mountTree(
      <ScenePane
        tree={makeTree()}
        selectedId=""
        onSelect={() => {}}
        onToggleVisibility={() => {}}
        onMoveNode={() => {}}
      />,
    )
    const span = container.querySelector('[data-node-id="1"]') as HTMLElement
    expect(span.getAttribute('draggable')).toBe('true')
    // Geometry fix (ADR-0001): the hitbox must cover the whole label
    // cell, not just the glyphs.
    expect(span.style.display).toBe('block')
    expect(span.style.width).toBe('100%')
    unmount()
  })
})
