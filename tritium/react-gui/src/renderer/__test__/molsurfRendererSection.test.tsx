/**
 * MolSurf (MolSurfRenderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `molsurf` renderer's inspector page
 * migrated from the UXP `molsurf-propdlg` "MolSurf" tab.
 *
 * The pins:
 *   - the registry resolves `type_name === "molsurf"` to a single "MolSurf"
 *     section (default-expanded);
 *   - the curated rows render (Drawing mode / Line/Point size / Selection mol /
 *     Selection); the dsurface-only Surface type / Detail and unrelated props
 *     (elepot) produce no rows;
 *   - `colormode` is present in the entry list but produces NO row -- coloring
 *     is owned by the Coloring panel (ColorPane), which is the only place that
 *     can edit the colors that go with the mode;
 *   - "Drawing mode" writes `drawmode`; Line/Point size is disabled while the
 *     mode is "fill" and enabled for line / point (UXP updateDisabledState);
 *   - "Selection mol" writes the raw `target` name and keeps the current value
 *     selectable (no "(none)" entry).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// Mutable cm holder; molsurf tests run with cm=null (the name list stays empty).
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

import { MolSurfMainSection } from '../components/inspector/MolSurfRendererSection'
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

function molsurfEntries(over?: { drawmode?: string; target?: string }): GenericPropEntry[] {
  return [
    entry({ key: 'drawmode', type: 'enum', value: over?.drawmode ?? 'fill', enumdef: ['fill', 'line', 'point'] }),
    entry({ key: 'width', type: 'real', value: 1.2 }),
    entry({ key: 'target', type: 'string', value: over?.target ?? '' }),
    entry({ key: 'showsel', type: 'object<MolSelection>', value: '' }),
    entry({ key: 'colormode', type: 'enum', value: 'solid', enumdef: ['solid', 'molecule', 'potential'] }),
  ]
}

describe('MolSurf renderer section registry', () => {
  it('resolves type_name "molsurf" to a single default-expanded "MolSurf" section', () => {
    const sections = getRendererPropSections('molsurf')
    expect(sections.map((s) => s.title)).toEqual(['MolSurf'])
    expect(sections[0].defaultExpanded).toBe(true)
    expect(sections[0].Component).toBe(MolSurfMainSection)
    expect(RENDERER_SECTION_REGISTRY.molsurf).toBe(sections)
  })
})

describe('MolSurfMainSection', () => {
  it('renders the curated rows and ignores dsurface-only / unrelated props', () => {
    const entries = [
      ...molsurfEntries(),
      // dsurface-only and coloring-panel props are present but not on this tab.
      entry({ key: 'surftype', type: 'enum', value: 'ses', enumdef: ['vdw', 'sas', 'ses'] }),
      entry({ key: 'detail', type: 'integer', value: 5 }),
      entry({ key: 'elepot', type: 'string', value: '' }),
    ]
    const { container, unmount } = mountTree(
      <MolSurfMainSection entries={entries} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    for (const label of ['Drawing mode', 'Line/Point size', 'Selection mol', 'Selection']) {
      expect(rowByLabel(container, label), label).not.toBeNull()
    }
    expect(rowByLabel(container, 'Surface type')).toBeNull()
    expect(rowByLabel(container, 'Detail')).toBeNull()
    expect(container.querySelectorAll('.h3-form-prop-row').length).toBe(4)
    unmount()
  })

  it('does not surface a coloring-mode row even though colormode is in the entries', () => {
    // Coloring belongs to the Coloring panel (ColorPane): the Inspector row
    // could switch the mode but never edit the colors that go with it.
    const { container, unmount } = mountTree(
      <MolSurfMainSection entries={molsurfEntries()} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(molsurfEntries().some((e) => e.key === 'colormode')).toBe(true)
    expect(rowByLabel(container, 'Coloring mode')).toBeNull()
    unmount()
  })

  it('writes drawmode and gates Line/Point size by mode', () => {
    const onSet = vi.fn()
    const fill = mountTree(
      <MolSurfMainSection entries={molsurfEntries({ drawmode: 'fill' })} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(rowByLabel(fill.container, 'Line/Point size')!.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    const select = rowByLabel(fill.container, 'Drawing mode')!.querySelector('select') as HTMLSelectElement
    selectValue(select, 'line')
    expect(onSet).toHaveBeenCalledWith('drawmode', 'enum', 'line')
    fill.unmount()

    const line = mountTree(
      <MolSurfMainSection entries={molsurfEntries({ drawmode: 'line' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(rowByLabel(line.container, 'Line/Point size')!.querySelector('.h3-form-drag-disabled')).toBeNull()
    line.unmount()
  })

  it('commits the Selection mol target and keeps the current value selectable (no "(none)")', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <MolSurfMainSection entries={molsurfEntries({ target: 'molA' })} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const select = rowByLabel(container, 'Selection mol')!.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('molA')
    // No "(none)" label is offered (only the empty placeholder when the value is empty).
    expect(Array.from(select.options).some((o) => o.textContent === '(none)')).toBe(false)
    selectValue(select, '')
    expect(onSet).toHaveBeenCalledWith('target', 'string', '')
    unmount()
  })
})
