/**
 * Renderer-common page UI-wiring contract.
 *
 * Pins the page's observable behaviour migrated from the UXP
 * `renderer-common-page`: which fields render for which properties, and which
 * `onSet(key, type, value)` call each control emits on commit. The page is
 * rows as data now, so the test mounts the schema through the engine -- what
 * it asserts is what the user sees either way. The heavy selection / colour
 * widgets are stubbed so this stays a focused wiring test; their internals are
 * covered by their own suites.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// useCueMol is used by the Material row (name fetch) -- no backend in test.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

// Stub MolSelList: expose its onCommit via a click so we can assert the
// selection commit path without rendering the real picker (popover/contexts).
vi.mock('../h3-kit/MolSelList/MolSelList', () => ({
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
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
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
import { SchemaSection } from '@renderer/components/inspector/SchemaSection'
import { RENDERER_COMMON_SECTIONS } from '@renderer/components/inspector/schema/common'

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

/** Find the property row (.h3-form-prop-row) whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
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

function render(
  entries: GenericPropEntry[],
  onSet = vi.fn(),
  onReset = vi.fn(),
  rendererType = '',
) {
  const r = mountTree(
    <>
      {RENDERER_COMMON_SECTIONS.map((section) => (
        <SchemaSection
          key={section.key}
          section={section}
          entries={entries}
          rendererType={rendererType}
          sceneId={1}
          onSet={onSet}
          onReset={onReset}
        />
      ))}
    </>,
  )
  return { ...r, onSet, onReset }
}

/** The three edge-line properties, as C++ reports them (enumdef alphabetical). */
function edgeEntries(egtype = 'none'): GenericPropEntry[] {
  return [
    entry({
      key: 'egtype',
      type: 'enum',
      value: egtype,
      // getPropsJSON returns the enumdef alphabetically.
      enumdef: ['edges', 'none', 'silhouette'],
    }),
    entry({ key: 'eglinew', type: 'real', value: 0.1 }),
    entry({ key: 'egcolor', type: 'object<AbstractColor>', value: 'blue' }),
  ]
}

describe('the renderer-common page', () => {
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

  it('marks a non-default property modified and resets it on the reset button', () => {
    const { container, onReset, unmount } = render([
      // alpha has a default and is currently NOT at it -> modified.
      entry({ key: 'alpha', type: 'real', value: 0.5, hasdefault: true, isdefault: false }),
    ])
    const row = rowByLabel(container, 'Opacity')!
    expect(row.classList.contains('is-modified')).toBe(true)
    const reset = row.querySelector(
      '[aria-label="Reset to default"]',
    ) as HTMLButtonElement
    expect(reset).not.toBeNull()
    expect(reset.disabled).toBe(false)
    act(() => reset.click())
    expect(onReset).toHaveBeenCalledWith('alpha')
    unmount()
  })

  it('never offers reset for name even when it has a non-default value', () => {
    const { container, unmount } = render([
      entry({ key: 'name', type: 'string', value: 'rend1', hasdefault: true, isdefault: false }),
    ])
    const row = rowByLabel(container, 'Name')!
    expect(row.classList.contains('is-modified')).toBe(false)
    expect(row.querySelector('[aria-label="Reset to default"]')).toBeNull()
    unmount()
  })

  it('surfaces the default value via the reset button (no inline label)', () => {
    const { container, unmount } = render([
      entry({ key: 'alpha', type: 'real', value: 0.5, hasdefault: true, isdefault: false, defaultValue: 1 }),
    ])
    const row = rowByLabel(container, 'Opacity')!
    // The faint inline annotation is gone.
    expect(row.querySelector('.h3-form-prop-default')).toBeNull()
    // The default value is shown via the reset button (tooltip / aria-label).
    const reset = row.querySelector('.h3-form-prop-reset') as HTMLElement
    expect(reset.getAttribute('aria-label')).toContain('1.00')
    unmount()
  })

  it('does not mark a property modified when it is at its default', () => {
    const { container, unmount } = render([
      entry({ key: 'alpha', type: 'real', value: 1, hasdefault: true, isdefault: true }),
    ])
    const row = rowByLabel(container, 'Opacity')!
    expect(row.classList.contains('is-modified')).toBe(false)
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

  // The C++ enumdef is alphabetical; the row fixes the reading order instead.
  it('offers the edge types as none -> edges -> silhouette', () => {
    const { container, unmount } = render(edgeEntries())
    const select = rowByLabel(container, 'Edge type')!.querySelector(
      'select',
    ) as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'none',
      'edges',
      'silhouette',
    ])
    unmount()
  })

  // Line-only renderers have no faces to outline, so the whole block is a set
  // of dead knobs there even though C++ still exposes the three properties.
  it.each(['simple', 'trace', 'contour'])(
    'suppresses the Edge lines block for the %s renderer',
    (rendererType) => {
      const { container, unmount } = render(
        edgeEntries(),
        vi.fn(),
        vi.fn(),
        rendererType,
      )
      expect(rowByLabel(container, 'Edge type')).toBeNull()
      expect(rowByLabel(container, 'Width')).toBeNull()
      expect(container.querySelector('[data-testid="egcolor"]')).toBeNull()
      unmount()
    },
  )

  it('keeps the Edge lines block for a surface renderer', () => {
    const { container, unmount } = render(edgeEntries(), vi.fn(), vi.fn(), 'molsurf')
    expect(rowByLabel(container, 'Edge type')).not.toBeNull()
    unmount()
  })

  it('disables Width and Color when the edge type is "none"', () => {
    const { container, unmount } = render([
      entry({ key: 'egtype', type: 'enum', value: 'none', enumdef: ['none', 'edges', 'silhouette'] }),
      entry({ key: 'eglinew', type: 'real', value: 0.1 }),
      entry({ key: 'egcolor', type: 'object<AbstractColor>', value: 'blue' }),
    ])
    const widthDrag = rowByLabel(container, 'Width')!.querySelector('.h3-form-drag') as HTMLElement
    expect(widthDrag.classList.contains('h3-form-drag-disabled')).toBe(true)
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
    const widthDrag = rowByLabel(container, 'Width')!.querySelector('.h3-form-drag') as HTMLElement
    expect(widthDrag.classList.contains('h3-form-drag-disabled')).toBe(false)
    expect(
      container.querySelector('[data-testid="egcolor"]')!.getAttribute('data-disabled'),
    ).toBe('false')
    unmount()
  })
})
