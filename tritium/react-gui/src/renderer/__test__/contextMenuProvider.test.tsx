/**
 * Behavior tests for the Windows/Linux React context menu host.
 *
 * Pins the show() promise contract that the navi / scene-tree / text
 * context-menu hooks rely on: a picked leaf resolves with its action value,
 * click-away and Escape resolve with null, and a second show() while one
 * menu is open resolves the first with null (single-menu invariant).
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { ContextMenuProvider, useShowContextMenu } from '../components/menu/ContextMenuProvider'
import type { ShowContextMenuFn } from '../components/menu/ContextMenuProvider'
import type { MenuNode } from '@shared/menuNodes'

void React

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const NODES: MenuNode<string>[] = [
  { label: 'Alpha', action: 'alpha' },
  { type: 'separator' },
  { label: 'Beta', enabled: false, action: 'beta' },
  { label: 'Sub', submenu: [{ label: 'Child', action: 'child' }] },
]

function mount(): { container: HTMLElement; show: ShowContextMenuFn; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let show!: ShowContextMenuFn
  const Capture: React.FC = () => {
    show = useShowContextMenu()
    return null
  }
  let root!: Root
  act(() => {
    root = createRoot(container)
    root.render(
      <ContextMenuProvider>
        <Capture />
      </ContextMenuProvider>,
    )
  })
  return {
    container,
    show,
    unmount() {
      act(() => root.unmount())
      document.body.removeChild(container)
    },
  }
}

function itemByLabel(root: ParentNode, label: string): HTMLElement {
  return Array.from(root.querySelectorAll('.menu-item')).find(
    (el) => el.textContent === label,
  ) as HTMLElement
}

describe('ContextMenuProvider', () => {
  it('resolves with the picked action and closes', async () => {
    const { container, show, unmount } = mount()
    let promise!: Promise<string | null>
    act(() => { promise = show(NODES, { x: 10, y: 10 }) })
    expect(document.body.querySelector('.ctx-menu-overlay')).toBeTruthy()

    act(() => { itemByLabel(document.body, 'Alpha').click() })
    await expect(promise).resolves.toBe('alpha')
    expect(document.body.querySelector('.ctx-menu-overlay')).toBeNull()
    void container
    unmount()
  })

  it('resolves null on click-away (overlay mousedown)', async () => {
    const { show, unmount } = mount()
    let promise!: Promise<string | null>
    act(() => { promise = show(NODES, { x: 10, y: 10 }) })
    const overlay = document.body.querySelector('.ctx-menu-overlay') as HTMLElement
    act(() => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    await expect(promise).resolves.toBeNull()
    unmount()
  })

  it('resolves null on Escape', async () => {
    const { show, unmount } = mount()
    let promise!: Promise<string | null>
    act(() => { promise = show(NODES, { x: 10, y: 10 }) })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await expect(promise).resolves.toBeNull()
    unmount()
  })

  it('a second show() supersedes the first (resolves it with null)', async () => {
    const { show, unmount } = mount()
    let first!: Promise<string | null>
    let second!: Promise<string | null>
    act(() => { first = show(NODES, { x: 10, y: 10 }) })
    act(() => { second = show(NODES, { x: 20, y: 20 }) })
    await expect(first).resolves.toBeNull()

    act(() => { itemByLabel(document.body, 'Alpha').click() })
    await expect(second).resolves.toBe('alpha')
    unmount()
  })

  it('disabled items do not resolve; submenu opens on hover and its child resolves', async () => {
    const { show, unmount } = mount()
    let promise!: Promise<string | null>
    act(() => { promise = show(NODES, { x: 10, y: 10 }) })

    // Disabled row: pointer-events none in real CSS; the component also
    // guards in the click handler, which is what jsdom exercises.
    act(() => { itemByLabel(document.body, 'Beta').click() })
    expect(document.body.querySelector('.ctx-menu-overlay')).toBeTruthy()

    // Open the submenu and pick the child.
    const sub = Array.from(document.body.querySelectorAll('.menu-item')).find(
      (el) => el.textContent?.startsWith('Sub'),
    ) as HTMLElement
    act(() => { sub.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) })
    act(() => { itemByLabel(document.body, 'Child').click() })
    await expect(promise).resolves.toBe('child')
    unmount()
  })
})
