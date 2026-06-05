/**
 * Isosurf (MapSurfRenderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `isosurf` renderer's inspector page
 * migrated from the UXP `isosurf-propdlg` "Map" tab.
 *
 * The pins:
 *   - the registry resolves `type_name === "isosurf"` to a single "Isosurf"
 *     section (default-expanded);
 *   - the curated rows render (Center update / Drawing mode / Line-Point size /
 *     Max grid size / Back-face culling / Use periodic boundary / Limit display
 *     by / Target / Selection / Distance) and unrelated props (coloring) are
 *     ignored;
 *   - "Drawing mode" writes `drawmode`; Line/Point size is disabled while the
 *     mode is "fill" and enabled for line / point (UXP updateDisabledState);
 *   - "Max grid size" commits a single-step `max_grids`; "Back-face culling"
 *     writes `cullface`;
 *   - the shared "Center update" pair-write and "Limit display by" off-clear
 *     behave as on contour; the Target selector lists molecules only.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// Mutable cm holder; isosurf tests run with cm=null (the name list stays empty).
const state = vi.hoisted(() => ({ cm: null as unknown }))

vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: state.cm, cueMolReady: !!state.cm }),
}))

vi.mock('../h3-kit/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel, onCommit, disabled }: any) => (
    <button data-testid="sel" data-disabled={String(!!disabled)} onClick={() => onCommit?.('newsel')}>
      {selectedSel}
    </button>
  ),
}))

import { IsosurfMainSection } from '../components/inspector/IsosurfRendererSection'
import {
  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
} from '../components/inspector/rendererPropSections'

beforeEach(() => {
  state.cm = null
})
afterEach(() => {
  state.cm = null
})

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

function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function selectValue(select: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function switchIn(row: HTMLElement): HTMLInputElement {
  return row.querySelector('input[type="checkbox"]') as HTMLInputElement
}

function isosurfEntries(over?: { drawmode?: string; bndryMol?: string }): GenericPropEntry[] {
  return [
    entry({ key: 'autoupdate', type: 'boolean', value: true }),
    entry({ key: 'dragupdate', type: 'boolean', value: false }),
    entry({ key: 'drawmode', type: 'enum', value: over?.drawmode ?? 'fill', enumdef: ['fill', 'line', 'point'] }),
    entry({ key: 'width', type: 'real', value: 1.2 }),
    entry({ key: 'max_grids', type: 'real', value: 100 }),
    entry({ key: 'cullface', type: 'boolean', value: false }),
    entry({ key: 'use_pbc', type: 'boolean', value: true }),
    entry({ key: 'bndry_molname', type: 'string', value: over?.bndryMol ?? '' }),
    entry({ key: 'bndry_sel', type: 'object<MolSelection>', value: '' }),
    entry({ key: 'bndry_rng', type: 'real', value: 5.0 }),
  ]
}

describe('Isosurf renderer section registry', () => {
  it('resolves type_name "isosurf" to a single default-expanded "Isosurf" section', () => {
    const sections = getRendererPropSections('isosurf')
    expect(sections.map((s) => s.title)).toEqual(['Isosurf'])
    expect(sections[0].defaultExpanded).toBe(true)
    expect(sections[0].Component).toBe(IsosurfMainSection)
    expect(RENDERER_SECTION_REGISTRY.isosurf).toBe(sections)
  })
})

describe('IsosurfMainSection', () => {
  it('renders the curated rows and ignores unrelated (coloring) props', () => {
    const entries = [
      ...isosurfEntries(),
      entry({ key: 'colormode', type: 'enum', value: 'solid', enumdef: ['solid'] }),
      entry({ key: 'siglevel', type: 'real', value: 1.1 }),
    ]
    const { container, unmount } = mountTree(
      <IsosurfMainSection entries={entries} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    for (const label of [
      'Center update',
      'Drawing mode',
      'Line/Point size',
      'Max grid size',
      'Back-face culling',
      'Use periodic boundary',
      'Limit display by',
      'Target',
      'Selection',
      'Distance',
    ]) {
      expect(rowByLabel(container, label), label).not.toBeNull()
    }
    expect(container.querySelectorAll('.h3-form-prop-row').length).toBe(10)
    unmount()
  })

  it('writes drawmode and gates Line/Point size by mode', () => {
    const onSet = vi.fn()
    const fill = mountTree(
      <IsosurfMainSection entries={isosurfEntries({ drawmode: 'fill' })} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    // fill -> Line/Point size disabled.
    expect(rowByLabel(fill.container, 'Line/Point size')!.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    const select = rowByLabel(fill.container, 'Drawing mode')!.querySelector('select') as HTMLSelectElement
    selectValue(select, 'line')
    expect(onSet).toHaveBeenCalledWith('drawmode', 'enum', 'line')
    fill.unmount()

    const line = mountTree(
      <IsosurfMainSection entries={isosurfEntries({ drawmode: 'line' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    // line -> Line/Point size enabled.
    expect(rowByLabel(line.container, 'Line/Point size')!.querySelector('.h3-form-drag-disabled')).toBeNull()
    line.unmount()
  })

  it('commits Max grid size as a single step on Enter', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <IsosurfMainSection entries={isosurfEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const input = rowByLabel(container, 'Max grid size')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '120'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSet).toHaveBeenCalledWith('max_grids', 'real', 120)
    unmount()
  })

  it('toggles Back-face culling', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <IsosurfMainSection entries={isosurfEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    act(() => switchIn(rowByLabel(container, 'Back-face culling')!).click())
    expect(onSet).toHaveBeenCalledWith('cullface', 'boolean', true)
    unmount()
  })

  it('writes the autoupdate/dragupdate pair in one step (shared Center update)', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <IsosurfMainSection entries={isosurfEntries()} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const select = rowByLabel(container, 'Center update')!.querySelector('select') as HTMLSelectElement
    selectValue(select, 'drag')
    expect(onSetMany).toHaveBeenLastCalledWith([
      { key: 'autoupdate', valueType: 'boolean', value: true },
      { key: 'dragupdate', valueType: 'boolean', value: true },
    ])
    unmount()
  })

  it('clears target + selection in one step when "Limit display by" is turned off (shared)', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <IsosurfMainSection entries={isosurfEntries({ bndryMol: 'molX' })} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    act(() => switchIn(rowByLabel(container, 'Limit display by')!).click())
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'bndry_molname', valueType: 'string', value: '' },
      { key: 'bndry_sel', valueType: 'object<MolSelection>', value: '' },
    ])
    unmount()
  })

  it('disables Target / Selection / Distance when limiting is off', () => {
    const { container, unmount } = mountTree(
      <IsosurfMainSection entries={isosurfEntries({ bndryMol: '' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect((rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement).disabled).toBe(true)
    expect(
      (rowByLabel(container, 'Selection')!.querySelector('[data-testid="sel"]') as HTMLElement).getAttribute('data-disabled'),
    ).toBe('true')
    expect(rowByLabel(container, 'Distance')!.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    unmount()
  })
})
