/**
 * Degrade-detection test for the Undo/Redo split button.
 *
 * Pins:
 *   - the body button is disabled when `canExecute` is false;
 *   - the history dropdown lists one item per description and picking the
 *     k-th item calls `onPick(k)` (k = the C++ undo(depth) argument, so the
 *     top entry = depth 0 = a single step);
 *   - the caret is disabled when the history is empty.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'

const dispatch = vi.fn(() => Promise.resolve())
vi.mock('../commands/CommandRegistry', () => ({
  useCommands: () => ({ dispatch, register: vi.fn(), has: vi.fn() }),
}))

import { UndoRedoSplitButton } from '../components/toolbar/UndoRedoSplitButton'

void React

function bodyButton(container: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  )
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn as HTMLButtonElement
}

describe('UndoRedoSplitButton', () => {
  beforeEach(() => dispatch.mockClear())
  afterEach(() => {
    // Drop any Blueprint Popover portals left in document.body.
    document.querySelectorAll('.bp5-portal').forEach((n) => n.remove())
  })

  it('disables the body button when canExecute is false', () => {
    const onPick = vi.fn()
    const t = mountTree(
      <UndoRedoSplitButton kind="undo" canExecute={false} descs={[]} onPick={onPick} />,
    )
    expect(bodyButton(t.container, 'Undo').disabled).toBe(true)
    t.unmount()
  })

  it('disables the caret when there is no history', () => {
    const onPick = vi.fn()
    const t = mountTree(
      <UndoRedoSplitButton kind="redo" canExecute={false} descs={[]} onPick={onPick} />,
    )
    const caret = t.container.querySelector(
      '[aria-label="Redo history"]',
    ) as HTMLButtonElement
    expect(caret.disabled).toBe(true)
    t.unmount()
  })

  it('lists one item per description and picks by index (top = 0)', () => {
    const onPick = vi.fn()
    const t = mountTree(
      <UndoRedoSplitButton
        kind="undo"
        canExecute
        descs={['most recent', 'older', 'oldest']}
        onPick={onPick}
      />,
    )
    const caret = t.container.querySelector(
      '[aria-label="Undo history"]',
    ) as HTMLButtonElement
    act(() => {
      caret.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const items = Array.from(
      document.querySelectorAll('a.bp5-menu-item'),
    ) as HTMLElement[]
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      'most recent',
      'older',
      'oldest',
    ])

    act(() => {
      items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onPick).toHaveBeenCalledWith(1)

    t.unmount()
  })
})
