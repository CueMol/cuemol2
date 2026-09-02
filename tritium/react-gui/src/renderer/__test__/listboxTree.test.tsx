import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import type { TreeNodeInfo } from '@blueprintjs/core'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { ListboxTree } from '@renderer/h3-kit/list'

void React

/**
 * Degrade-detection tests for ListboxTree, the kit's Blueprint Tree wrapper.
 * It exists so tree rows draw the kit's DisclosureCaret instead of
 * Blueprint's own (heavier) caret; these pin the parts a refactor could
 * silently lose:
 *   - Blueprint's caret never renders; every row gets a kit caret slot, a
 *     glyph only where Blueprint would have drawn a caret (children, or an
 *     explicit hasCaret), a bare placeholder otherwise;
 *   - a click on the slot toggles through onNodeExpand / onNodeCollapse with
 *     the consumer's node and path, and does not reach onNodeClick;
 *   - a disabled node's caret is inert;
 *   - the tree carries the `.h3-listbox-tree` metrics class.
 */

const click = (el: Element) =>
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

function contents(expanded: boolean): TreeNodeInfo[] {
  return [
    {
      id: 'mol',
      label: 'mol',
      isExpanded: expanded,
      childNodes: [
        { id: 'rend', label: 'rend' },
        { id: 'forced', label: 'forced', hasCaret: true },
      ],
    },
    { id: 'leaf', label: 'leaf' },
    { id: 'off', label: 'off', hasCaret: false, childNodes: [{ id: 'hidden', label: 'hidden' }] },
    { id: 'dis', label: 'dis', disabled: true, childNodes: [{ id: 'c', label: 'c' }] },
  ]
}

describe('ListboxTree', () => {
  it('replaces the Blueprint caret with a kit caret slot on every row', () => {
    const { container, unmount } = mountTree(
      <ListboxTree contents={contents(true)} className="t" />,
    )
    expect(container.querySelector('.bp5-tree-node-caret')).toBeNull()
    expect(container.querySelector('.bp5-tree.h3-listbox-tree.t')).not.toBeNull()

    const rows = Array.from(container.querySelectorAll('.bp5-tree-node-content'))
    // mol (expanded) + its 2 children + leaf + off + dis = 6 visible rows
    expect(rows.length).toBe(6)
    expect(rows.every((r) => r.querySelector('.h3-tree-caret .h3-caret'))).toBe(true)

    const glyphState = rows.map((r) =>
      r.querySelector('.h3-tree-caret .h3-caret')!.getAttribute('data-expanded'))
    //           mol     rend  forced   leaf  off   dis
    expect(glyphState).toEqual(['true', null, 'false', null, null, 'false'])
    unmount()
  })

  it('toggles through onNodeExpand / onNodeCollapse without selecting the row', () => {
    const onExpand = vi.fn()
    const onCollapse = vi.fn()
    const onClick = vi.fn()
    const { container, unmount } = mountTree(
      <ListboxTree
        contents={contents(false)}
        onNodeExpand={onExpand}
        onNodeCollapse={onCollapse}
        onNodeClick={onClick}
      />,
    )
    click(container.querySelector('.h3-tree-caret')!)
    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(onExpand.mock.calls[0][0].id).toBe('mol')
    expect(onExpand.mock.calls[0][1]).toEqual([0])
    expect(onCollapse).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
    unmount()

    const expanded = mountTree(
      <ListboxTree
        contents={contents(true)}
        onNodeExpand={onExpand}
        onNodeCollapse={onCollapse}
        onNodeClick={onClick}
      />,
    )
    const slots = expanded.container.querySelectorAll('.h3-tree-caret')
    click(slots[0]) // mol: expanded -> collapse
    expect(onCollapse).toHaveBeenCalledTimes(1)
    expect(onCollapse.mock.calls[0][1]).toEqual([0])
    click(slots[2]) // forced (child index 1 of mol): hasCaret with no children
    expect(onExpand).toHaveBeenCalledTimes(2)
    expect(onExpand.mock.calls[1][0].id).toBe('forced')
    expect(onExpand.mock.calls[1][1]).toEqual([0, 1])
    expect(onClick).not.toHaveBeenCalled()
    expanded.unmount()
  })

  it('leaves a disabled node caret and a leaf slot inert', () => {
    const onExpand = vi.fn()
    const { container, unmount } = mountTree(
      <ListboxTree contents={contents(true)} onNodeExpand={onExpand} />,
    )
    const slots = container.querySelectorAll('.h3-tree-caret')
    click(slots[3]) // leaf
    click(slots[5]) // dis
    expect(onExpand).not.toHaveBeenCalled()
    unmount()
  })
})
