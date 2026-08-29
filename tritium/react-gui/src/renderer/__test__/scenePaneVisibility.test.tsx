/**
 * Degrade-detection test for the ScenePane visibility-toggle tristate.
 *
 * UXP's V-column eye icon has three states (`workspace_panel.js`
 * `getCellProperties` + `cuemol2.css` `visible1-dis.png`): visible,
 * hidden, and "grayed out" when the row's own flag is ON but an ancestor
 * (object / group) is hidden -- the renderer keeps `visible=true` yet does
 * not draw. Pins the className contract the side-panel CSS keys on
 * (`visible` / `disabled` / `hidden`) and the click behaviour: the
 * gray-out state is a no-op (intentional deviation from UXP, which let
 * the click flip the ineffective flag).
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
 * scene
 *  - object 1 (visible)
 *     - renderer 11: own ON, ancestors ON       -> visible
 *     - renderer 12: own OFF                    -> hidden
 *     - rendGroup 3 (hidden)                    -> hidden (closed eye)
 *        - renderer 31: cascaded OFF by group   -> gray-out (member of a
 *          hidden group; the show-cascade turns it back ON)
 *  - object 2 (hidden)
 *     - renderer 21: own ON, parent hidden      -> gray-out (tristate)
 */
function makeTristateTree(): SceneTreeNode {
  return mkNode({
    id: 0,
    type: 'scene',
    children: [
      mkNode({
        id: 1, type: 'object', className: 'PDBMol',
        children: [
          mkNode({ id: 11, type: 'renderer' }),
          mkNode({
            id: 12, type: 'renderer',
            visible: false, effectiveVisible: false,
          }),
          mkNode({
            id: 3, type: 'rendGroup',
            visible: false, effectiveVisible: false,
            children: [
              mkNode({
                id: 31, type: 'renderer',
                visible: false, effectiveVisible: false,
              }),
            ],
          }),
        ],
      }),
      mkNode({
        id: 2, type: 'object', className: 'PDBMol',
        visible: false, effectiveVisible: false,
        children: [
          mkNode({
            id: 21, type: 'renderer',
            visible: true, effectiveVisible: false,
          }),
        ],
      }),
    ],
  })
}

/** Resolve the row's visibility button via the label span's data-node-id. */
function findToggle(container: HTMLElement, id: number): HTMLElement | null {
  const label = container.querySelector(`[data-node-id="${id}"]`)
  return (
    (label
      ?.closest('.bp5-tree-node-content')
      ?.querySelector('.visibility-toggle') as HTMLElement | null) ?? null
  )
}

describe('ScenePane visibility tristate', () => {
  it('classes the eye button visible / disabled / hidden per own + effective visibility', () => {
    const { container, unmount } = mountTree(
      withSceneTree({ tree: makeTristateTree(), selectedId: "", onSelect: () => {}, onToggleVisibility: () => {}, onMoveNode: () => {} }, <ScenePane />),
    )
    // visible / hidden are carried by the glyph alone (no CSS color rule);
    // pin their class computation only.
    expect(findToggle(container, 11)?.classList.contains('visible')).toBe(true)
    expect(findToggle(container, 12)?.classList.contains('hidden')).toBe(true)
    const gray = findToggle(container, 21)
    // The selector below mirrors styles/_side-panel.css verbatim. Using
    // `matches()` (not classList) pins that the stylesheet actually
    // targets the rendered DOM: Blueprint renders a custom icon element
    // (the Phosphor svg) directly inside the button with NO .bp5-icon
    // wrapper, so a .bp5-icon-scoped selector silently matches nothing
    // and the gray-out state falls back to the plain text color.
    expect(gray?.matches('.visibility-toggle.disabled.bp5-button')).toBe(true)
    expect(gray?.classList.contains('hidden')).toBe(false)
    expect(gray?.classList.contains('visible')).toBe(false)
    // The state color is set on the button; the glyph must inherit it.
    expect(gray?.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
    // The hidden ancestor object itself is plain hidden, not grayed.
    expect(findToggle(container, 2)?.classList.contains('hidden')).toBe(true)

    // Members of a hidden group: their own flag is cascaded OFF, but the
    // show-cascade turns them back ON, so they read as gray-out with the
    // OPEN-eye glyph (same relationship as object/renderer). The group
    // row itself is plain hidden (closed eye), like a hidden object row.
    const svgPath = (el: HTMLElement | null): string | null | undefined =>
      el?.querySelector('svg path')?.getAttribute('d')
    const groupChild = findToggle(container, 31)
    expect(groupChild?.classList.contains('disabled')).toBe(true)
    expect(groupChild?.classList.contains('hidden')).toBe(false)
    expect(svgPath(groupChild)).toBe(svgPath(findToggle(container, 11)))
    expect(svgPath(groupChild)).not.toBe(svgPath(findToggle(container, 12)))
    expect(findToggle(container, 3)?.classList.contains('hidden')).toBe(true)
    unmount()
  })

  it('ignores clicks on the gray-out state; visible / hidden still toggle', () => {
    const onToggleVisibility = vi.fn()
    const { container, unmount } = mountTree(
      withSceneTree({ tree: makeTristateTree(), selectedId: "", onSelect: () => {}, onToggleVisibility: onToggleVisibility, onMoveNode: () => {} }, <ScenePane />),
    )
    // Gray-out: own flag is ON but an ancestor hides the renderer --
    // flipping the flag would visibly do nothing, so the click is a no-op.
    act(() => { findToggle(container, 21)!.click() })
    // Member of a hidden group: toggling would desync it from the group
    // cascade (C++ has no group display gate), so it is a no-op too.
    act(() => { findToggle(container, 31)!.click() })
    expect(onToggleVisibility).not.toHaveBeenCalled()
    // The other states keep their toggle behaviour, including the hidden
    // group row itself.
    act(() => { findToggle(container, 11)!.click() })
    expect(onToggleVisibility).toHaveBeenCalledWith('11')
    act(() => { findToggle(container, 12)!.click() })
    expect(onToggleVisibility).toHaveBeenCalledWith('12')
    act(() => { findToggle(container, 3)!.click() })
    expect(onToggleVisibility).toHaveBeenCalledWith('3')
    unmount()
  })
})
