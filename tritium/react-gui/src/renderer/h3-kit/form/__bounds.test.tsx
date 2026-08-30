/**
 * @file h3-kit/form/__bounds.test.tsx
 * @description Pins the numeric bounds contracts of the form-kit inputs.
 *
 * `min` / `max` are passed to the underlying <input type="number">, but the
 * HTML attributes only constrain the spinner buttons -- a browser accepts any
 * typed value. NumericField fed every parseable keystroke straight to
 * onChange, so typing 9999 into a 0..100 property (Inspector NumRow, GenericTab,
 * SettingRow, the APBS and interaction dialogs all use it) committed 9999 to
 * the C++ property. RejectNumberInput's own doc comment claimed NumericField
 * clamps; it did not.
 *
 * VectorField had the mirror problem at the empty end: `Number('')` is 0 and
 * `Number.isFinite(0)` is true, so clearing an axis cell and tabbing away
 * silently wrote 0 into it -- while the file header promised an unparseable
 * cell would be rejected and snap back.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { NumericField } from './NumericField'
import { VectorField } from './VectorField'
import { DragNumericField } from './DragNumericField'

void React

function typeInto(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value',
  )!.set!
  setter.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('NumericField bounds', () => {
  it.each([
    ['above max', '9999', 100],
    ['below min', '-50', 0],
  ])('clamps a typed value %s', (_label, typed, expected) => {
    const onChange = vi.fn()
    const { container, unmount } = mountTree(
      <NumericField value={5} min={0} max={100} onChange={onChange} />,
    )
    typeInto(container.querySelector('input') as HTMLInputElement, typed)
    expect(onChange).toHaveBeenLastCalledWith(expected)
    unmount()
  })

  it('passes an in-range value through untouched', () => {
    const onChange = vi.fn()
    const { container, unmount } = mountTree(
      <NumericField value={5} min={0} max={100} onChange={onChange} />,
    )
    typeInto(container.querySelector('input') as HTMLInputElement, '42')
    expect(onChange).toHaveBeenLastCalledWith(42)
    unmount()
  })

  it('does not commit while the text is not yet a number', () => {
    const onChange = vi.fn()
    const { container, unmount } = mountTree(
      <NumericField value={5} min={0} max={100} onChange={onChange} />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    typeInto(input, '')
    typeInto(input, '-')
    expect(onChange).not.toHaveBeenCalled()
    unmount()
  })
})

describe('VectorField empty cell', () => {
  it('does not write 0 when a cell is cleared', () => {
    const onCommit = vi.fn()
    const { container, unmount } = mountTree(
      <VectorField value="(1, 2, 3)" onCommit={onCommit} />,
    )
    const cell = container.querySelectorAll('input')[1] as HTMLInputElement
    typeInto(cell, '   ')
    cell.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(onCommit).not.toHaveBeenCalled()
    unmount()
  })

  it('still commits a real edit', () => {
    const onCommit = vi.fn()
    const { container, unmount } = mountTree(
      <VectorField value="(1, 2, 3)" onCommit={onCommit} />,
    )
    const cell = container.querySelectorAll('input')[1] as HTMLInputElement
    typeInto(cell, '7')
    cell.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toContain('7')
    unmount()
  })
})

describe('DragNumericField interaction announcements', () => {
  /**
   * `onDragStart` fires for an arrow press even when `realtime` is false. That
   * looks like an oversight next to the drag path, which gates on `realtime`,
   * and the prop doc used to claim it. It is deliberate: auto-repeat turns one
   * press into a run of steps, and the parent needs the pre-press value to
   * collapse the run into a single undo entry.
   */
  it('announces an arrow press even when not realtime', () => {
    const onDragStart = vi.fn()
    const { container, unmount } = mountTree(
      <DragNumericField
        value={5}
        min={0}
        max={100}
        step={1}
        onChange={() => {}}
        onDragStart={onDragStart}
      />,
    )
    const arrow = container.querySelector('.h3-form-drag-arrow-right') as HTMLElement
    arrow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onDragStart).toHaveBeenCalledTimes(1)
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    unmount()
  })
})
