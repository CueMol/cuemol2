/**
 * RendererCommonSection UI-wiring contract (renderer-common property page).
 *
 * Pins the renderer-common page's observable behaviour migrated from the UXP
 * `renderer-common-page`: which fields render for which properties, and which
 * `onSet(key, type, value)` call each control emits on commit. The heavy
 * selection / colour widgets are stubbed so this stays a focused wiring test;
 * their internals are covered by their own suites.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// useCueMol is used by MaterialRow (material-name fetch) -- no backend in test.
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

// Stub MolSelList: expose its onCommit via a click so we can assert the
// selection commit path without rendering the real picker (popover/contexts).
vi.mock('../components/widgets/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel, onCommit, disabled }: any) => (
    <button
      data-testid="molsel"
      data-disabled={String(!!disabled)}
      onClick={() => onCommit?.('newsel')}
    >
      {selectedSel}
    </button>
  ),
}))

// Stub the colour leaf so ColorField renders without the ColorPicker context.
vi.mock('../components/widgets/colorpicker/CueColorField', () => ({
  CueColorField: ({ value, onCommit, disabled }: any) => (
    <button
      data-testid="egcolor"
      data-disabled={String(!!disabled)}
      onClick={() => onCommit('red')}
    >
      {value}
    </button>
  ),
}))

// Imported after the mocks so they take effect.
import { RendererCommonSection } from '../components/inspector/RendererCommonSection'

function entry(over: Partial<GenericPropEntry>): GenericPropEntry {
  return {
    key: '',
    type: 'string',
    value: '',
    readonly: false,
    hasdefault: false,
    isdefault: false,
    isContainer: false,
    depth: 0,
    ...over,
  } as GenericPropEntry
}

/** Find the field row (.fk-field-row) whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.fk-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.fk-field-row') as HTMLElement) : null
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

function render(entries: GenericPropEntry[], onSet = vi.fn()) {
  const r = mountTree(
    <RendererCommonSection
      entries={entries}
      onSet={onSet}
      onReset={vi.fn()}
      sceneId={1}
    />,
  )
  return { ...r, onSet }
}

describe('RendererCommonSection', () => {
  it('renders only the fields whose property exists', () => {
    const { container, unmount } = render([
      entry({ key: 'name', type: 'string', value: 'rend1' }),
      entry({ key: 'visible', type: 'boolean', value: true }),
    ])
    expect(rowByLabel(container, 'Name')).not.toBeNull()
    expect(rowByLabel(container, 'Visible')).not.toBeNull()
    // No `sel` / `alpha` entry -> those rows are absent.
    expect(rowByLabel(container, 'Selection')).toBeNull()
    expect(rowByLabel(container, 'Opacity')).toBeNull()
    unmount()
  })

  it('commits the Name on Enter as a string', () => {
    const { container, onSet, unmount } = render([
      entry({ key: 'name', type: 'string', value: 'old' }),
    ])
    const input = rowByLabel(container, 'Name')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, 'new'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSet).toHaveBeenCalledWith('name', 'string', 'new')
    unmount()
  })

  it('commits a Visible toggle immediately as a boolean', () => {
    const { container, onSet, unmount } = render([
      entry({ key: 'visible', type: 'boolean', value: false }),
    ])
    const sw = rowByLabel(container, 'Visible')!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement
    act(() => sw.click())
    expect(onSet).toHaveBeenCalledWith('visible', 'boolean', true)
    unmount()
  })

  it('commits a selection as object<MolSelection>', () => {
    const { container, onSet, unmount } = render([
      entry({ key: 'sel', type: 'object<MolSelection>', value: 'protein' }),
    ])
    act(() => (container.querySelector('[data-testid="molsel"]') as HTMLElement).click())
    expect(onSet).toHaveBeenCalledWith('sel', 'object<MolSelection>', 'newsel')
    unmount()
  })

  it('disables Width and Color when the edge type is "none"', () => {
    const { container, unmount } = render([
      entry({ key: 'egtype', type: 'enum', value: 'none', enumdef: ['none', 'edges', 'silhouette'] }),
      entry({ key: 'eglinew', type: 'real', value: 0.1 }),
      entry({ key: 'egcolor', type: 'object<AbstractColor>', value: 'blue' }),
    ])
    const widthInput = rowByLabel(container, 'Width')!.querySelector('input') as HTMLInputElement
    expect(widthInput.disabled).toBe(true)
    expect(
      container.querySelector('[data-testid="egcolor"]')!.getAttribute('data-disabled'),
    ).toBe('true')
    unmount()
  })

  it('enables Width and Color when the edge type is not "none"', () => {
    const { container, unmount } = render([
      entry({ key: 'egtype', type: 'enum', value: 'silhouette', enumdef: ['none', 'edges', 'silhouette'] }),
      entry({ key: 'eglinew', type: 'real', value: 0.1 }),
      entry({ key: 'egcolor', type: 'object<AbstractColor>', value: 'blue' }),
    ])
    const widthInput = rowByLabel(container, 'Width')!.querySelector('input') as HTMLInputElement
    expect(widthInput.disabled).toBe(false)
    expect(
      container.querySelector('[data-testid="egcolor"]')!.getAttribute('data-disabled'),
    ).toBe('false')
    unmount()
  })
})
