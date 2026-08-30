/**
 * GenericTab UI-interaction contract.
 *
 * Pins the "default" checkbox <-> value-editor coupling that the UXP
 * `defaultToggleCheck` provided: a property sitting at its C++ default has a
 * disabled editor, and unchecking "default" must re-enable it WITHOUT
 * changing the value. Service / hook contracts are covered elsewhere
 * (genericProps.test.ts, useInspectorState.test.ts).
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import { GenericTab } from '@renderer/features/inspector/GenericTab'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

function makeEntry(over: Partial<GenericPropEntry> = {}): GenericPropEntry {
  return {
    key: 'name',
    type: 'string',
    value: 'hello',
    readonly: false,
    hasdefault: true,
    isdefault: true,
    isContainer: false,
    depth: 0,
    ...over,
  } as GenericPropEntry
}

/** Set a controlled <input> value so React's value tracker fires onChange. */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const selectFirstRow = (container: HTMLElement) =>
  act(() => (container.querySelector('tr.insp-gt-row') as HTMLElement).click())

const editorInput = (container: HTMLElement) =>
  container.querySelector(
    '.insp-generic-detail-editor input:not([type="checkbox"])',
  ) as HTMLInputElement

const defaultCheckbox = (container: HTMLElement) =>
  container.querySelector(
    '.insp-generic-default-check input[type="checkbox"]',
  ) as HTMLInputElement

describe('GenericTab', () => {
  it('builds every editor from the form-kit catalog, not raw Blueprint', () => {
    // Regression guard for the form-kit migration: the detail editors and the
    // filter field must carry the kit classes, so control height and spacing
    // keep their single source in _form-kit.css. A raw Blueprint control here
    // would size itself independently and drift from the rest of the app.
    const cases: Array<[Partial<GenericPropEntry>, string]> = [
      [{ key: 'k', type: 'string', value: 's' }, '.h3-form-input'],
      [{ key: 'k', type: 'real', value: 1.5 }, '.h3-form-numeric'],
      [{ key: 'k', type: 'boolean', value: true }, '.h3-form-switch'],
      [{ key: 'k', type: 'enum', value: 'a', enumdef: ['a', 'b'] }, '.h3-form-select'],
    ]
    for (const [over, selector] of cases) {
      const view = mountTree(
        <GenericTab
          entries={[makeEntry({ hasdefault: false, isdefault: false, ...over })]}
          onSetValue={vi.fn()}
          onResetValue={vi.fn()}
        />,
      )
      selectFirstRow(view.container)
      expect(
        view.container.querySelector(`.insp-generic-detail-editor ${selector}`),
        `${String(over.type)} editor should use the form-kit control`,
      ).not.toBeNull()
      // The "default" checkbox is a kit CheckboxField inside a kit Field row.
      expect(view.container.querySelector('.h3-form-checkbox')).not.toBeNull()
      view.unmount()
    }
  })

  it('renders the filter box as a form-kit TextField', () => {
    const view = mountTree(
      <GenericTab entries={[makeEntry()]} onSetValue={vi.fn()} onResetValue={vi.fn()} />,
    )
    expect(
      view.container.querySelector('.insp-generic-filter .h3-form-input'),
    ).not.toBeNull()
    view.unmount()
  })

  it('disables the editor at default and re-enables it when "default" is unchecked', () => {
    const onSetValue = vi.fn()
    const onResetValue = vi.fn()
    const { container, unmount } = mountTree(
      <GenericTab
        entries={[makeEntry()]}
        onSetValue={onSetValue}
        onResetValue={onResetValue}
      />,
    )
    selectFirstRow(container)

    const input = editorInput(container)
    const check = defaultCheckbox(container)
    expect(input.disabled).toBe(true)
    expect(check.checked).toBe(true)

    // Uncheck "default": editor becomes editable, value untouched.
    act(() => check.click())
    expect(editorInput(container).disabled).toBe(false)
    expect(editorInput(container).value).toBe('hello')
    expect(onResetValue).not.toHaveBeenCalled()
    expect(onSetValue).not.toHaveBeenCalled()

    unmount()
  })

  it('commits an edited value once "default" has been cleared', () => {
    const onSetValue = vi.fn()
    const { container, unmount } = mountTree(
      <GenericTab
        entries={[makeEntry()]}
        onSetValue={onSetValue}
        onResetValue={vi.fn()}
      />,
    )
    selectFirstRow(container)
    act(() => defaultCheckbox(container).click())

    const input = editorInput(container)
    act(() => typeInto(input, 'world'))
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onSetValue).toHaveBeenCalledWith('name', 'string', 'world')
    unmount()
  })

  it('checking "default" resets the property', () => {
    const onResetValue = vi.fn()
    const { container, unmount } = mountTree(
      <GenericTab
        entries={[makeEntry({ isdefault: false })]}
        onSetValue={vi.fn()}
        onResetValue={onResetValue}
      />,
    )
    selectFirstRow(container)

    const check = defaultCheckbox(container)
    expect(check.checked).toBe(false)
    act(() => check.click())

    expect(onResetValue).toHaveBeenCalledWith('name')
    unmount()
  })
})
