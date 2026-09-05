/**
 * @file __test__/textRow.test.tsx
 * @description The Properties-tab text row follows the committed value. The
 * row is not remounted when the value changes underneath it (a rename from
 * the scene tree, a switch to another node of the same kind), and a draft
 * seeded once used to survive that and be written back on the next blur.
 */

import React from 'react'
import { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { TextRow } from '@renderer/features/inspector/rows/TextRow'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

function entry(value: string): GenericPropEntry {
  return {
    key: 'name',
    type: 'string',
    value,
    readonly: false,
    hasdefault: false,
    isdefault: false,
    isContainer: false,
    depth: 0,
  } as GenericPropEntry
}

const input = (container: HTMLElement) => container.querySelector('input') as HTMLInputElement

describe('TextRow', () => {
  it('re-seeds its draft when the committed value changes', () => {
    const onSet = vi.fn()
    const view = mountTree(<TextRow entry={entry('ribbon1')} label="Name" onSet={onSet} onReset={vi.fn()} />)
    expect(input(view.container).value).toBe('ribbon1')
    view.rerender(<TextRow entry={entry('ribbon2')} label="Name" onSet={onSet} onReset={vi.fn()} />)
    expect(input(view.container).value).toBe('ribbon2')
    view.unmount()
  })

  it('does not write the previous text back after an external rename', () => {
    const onSet = vi.fn()
    const view = mountTree(<TextRow entry={entry('ribbon1')} label="Name" onSet={onSet} onReset={vi.fn()} />)
    view.rerender(<TextRow entry={entry('ribbon2')} label="Name" onSet={onSet} onReset={vi.fn()} />)
    act(() => input(view.container).dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(onSet).not.toHaveBeenCalled()
    view.unmount()
  })
})
