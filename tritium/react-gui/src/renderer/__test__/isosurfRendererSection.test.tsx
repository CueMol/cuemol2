/**
 * Isosurf (MapSurfRenderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `isosurf` renderer's inspector page
 * migrated from the UXP `isosurf-propdlg` "Map" tab.
 *
 * The pins:
 *   - the registry resolves `type_name === "isosurf"` to a single "Isosurf"
 *     section (default-expanded);
 *   - the curated rows render (Map kind / Center update / Drawing mode /
 *     Line-Point size / Max grid size / Cap mode / Back-face culling / Use
 *     periodic boundary / Limit display by / Target / Selection / Distance) and
 *     unrelated props (colormode / target / sel -- owned by the Coloring panel
 *     -- and siglevel) are ignored;
 *   - "Map kind" is the read-only kind forwarded from the DensityMap: static
 *     text, and dropped entirely when it resolves to nothing;
 *   - "Cap mode" writes the tri-state `cap_mode` as raw enum ids;
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
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// Mutable cm holder; isosurf tests run with cm=null (the name list stays empty).
const state = vi.hoisted(() => ({ cm: null as unknown }))

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: state.cm, cueMolReady: !!state.cm }),
}))

vi.mock('@renderer/h3-kit/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel, onCommit, disabled }: any) => (
    <button data-testid="sel" data-disabled={String(!!disabled)} onClick={() => onCommit?.('newsel')}>
      {selectedSel}
    </button>
  ),
}))

import { SchemaSection } from '@renderer/features/inspector/SchemaSection'
import { ISOSURF_SECTIONS } from '@renderer/features/inspector/schema/map'
import {

  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
} from '@renderer/features/inspector/rendererPropSections'


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

function isosurfEntries(over?: {
  drawmode?: string
  bndryMol?: string
  regionMode?: string
  regionResolved?: string
  mapKind?: string
  capMode?: string
}): GenericPropEntry[] {
  return [
    entry({ key: 'map_type_resolved', type: 'string', value: over?.mapKind ?? 'xtal', readonly: true }),
    entry({ key: 'autoupdate', type: 'boolean', value: true }),
    entry({ key: 'dragupdate', type: 'boolean', value: false }),
    entry({ key: 'region_mode', type: 'enum', value: over?.regionMode ?? 'auto', enumdef: ['auto', 'box', 'full'] }),
    entry({ key: 'region_mode_resolved', type: 'string', value: over?.regionResolved ?? 'box', readonly: true }),
    entry({ key: 'lod', type: 'enum', value: 'auto', enumdef: ['auto', 'step1', 'step2', 'step4', 'step8'] }),
    entry({ key: 'lod_budget', type: 'integer', value: 16 }),
    entry({ key: 'zoom_refine', type: 'boolean', value: true }),
    entry({ key: 'drawmode', type: 'enum', value: over?.drawmode ?? 'fill', enumdef: ['fill', 'line', 'point'] }),
    entry({ key: 'width', type: 'real', value: 1.2 }),
    entry({ key: 'max_grids', type: 'real', value: 100 }),
    entry({ key: 'cap_mode', type: 'enum', value: over?.capMode ?? 'auto', enumdef: ['auto', 'off', 'on'] }),
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
    expect(sections).toBe(ISOSURF_SECTIONS)
    expect(RENDERER_SECTION_REGISTRY.isosurf).toBe(sections)
  })
})

describe('the isosurf page', () => {
  it('renders the curated rows and ignores unrelated (coloring) props', () => {
    const entries = [
      ...isosurfEntries(),
      // Coloring props are owned by the Coloring panel, not this section.
      entry({ key: 'colormode', type: 'enum', value: 'solid', enumdef: ['molecule', 'multigrad', 'solid'] }),
      entry({ key: 'target', type: 'string', value: '' }),
      entry({ key: 'sel', type: 'object<MolSelection>', value: '' }),
      entry({ key: 'siglevel', type: 'real', value: 1.1 }),
    ]
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={entries} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    for (const label of [
      'Map kind',
      'Center update',
      'Region',
      'Level of detail',
      'Drawing mode',
      'Line/Point size',
      'Max grid size',
      'Cap mode',
      'Back-face culling',
      'Use periodic boundary',
      'Limit display by',
      'Target',
      'Selection',
      'Distance',
    ]) {
      expect(rowByLabel(container, label), label).not.toBeNull()
    }
    // The LoD budget and zoom refinement only apply to the full region and
    // stay hidden in box.
    expect(rowByLabel(container, 'LoD budget')).toBeNull()
    expect(rowByLabel(container, 'Refine on zoom')).toBeNull()
    expect(container.querySelectorAll('.h3-form-prop-row').length).toBe(14)
    unmount()
  })

  it('writes region_mode and lod as raw enum ids with friendly labels', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const region = rowByLabel(container, 'Region')!.querySelector('select') as HTMLSelectElement
    expect(Array.from(region.options).map((o) => o.value)).toEqual(['auto', 'box', 'full'])
    expect(Array.from(region.options).map((o) => o.textContent)).toEqual([
      'Auto',
      'Box around center',
      'Full map',
    ])
    selectValue(region, 'full')
    expect(onSet).toHaveBeenCalledWith('region_mode', 'enum', 'full')

    const lod = rowByLabel(container, 'Level of detail')!.querySelector('select') as HTMLSelectElement
    expect(Array.from(lod.options).map((o) => o.value)).toEqual(['auto', 'step1', 'step2', 'step4', 'step8'])
    selectValue(lod, 'step2')
    expect(onSet).toHaveBeenCalledWith('lod', 'enum', 'step2')
    unmount()
  })

  it('hides the box-only rows and shows the LoD budget in the full region', () => {
    // The effective region comes from the read-only resolved prop (auto on
    // a cryo-EM map resolves to full).
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={ISOSURF_SECTIONS[0]}
        rendererType="isosurf"
        entries={isosurfEntries({ regionMode: 'auto', regionResolved: 'full' })}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    expect(rowByLabel(container, 'Max grid size')).toBeNull()
    expect(rowByLabel(container, 'Use periodic boundary')).toBeNull()
    const budget = rowByLabel(container, 'LoD budget')
    expect(budget).not.toBeNull()
    const input = budget!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '32'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSet).toHaveBeenCalledWith('lod_budget', 'integer', 32)

    const refine = rowByLabel(container, 'Refine on zoom')
    expect(refine).not.toBeNull()
    act(() => switchIn(refine!).click())
    expect(onSet).toHaveBeenCalledWith('zoom_refine', 'boolean', false)
    unmount()
  })

  it('falls back to the raw region_mode when the resolved prop is absent', () => {
    const entries = isosurfEntries({ regionMode: 'full' }).filter((e) => e.key !== 'region_mode_resolved')
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={entries} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(rowByLabel(container, 'Max grid size')).toBeNull()
    expect(rowByLabel(container, 'LoD budget')).not.toBeNull()
    unmount()
  })

  it('writes drawmode and gates Line/Point size by mode', () => {
    const onSet = vi.fn()
    const fill = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries({ drawmode: 'fill' })} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    // fill -> Line/Point size disabled.
    expect(rowByLabel(fill.container, 'Line/Point size')!.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    const select = rowByLabel(fill.container, 'Drawing mode')!.querySelector('select') as HTMLSelectElement
    selectValue(select, 'line')
    expect(onSet).toHaveBeenCalledWith('drawmode', 'enum', 'line')
    fill.unmount()

    const line = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries({ drawmode: 'line' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    // line -> Line/Point size enabled.
    expect(rowByLabel(line.container, 'Line/Point size')!.querySelector('.h3-form-drag-disabled')).toBeNull()
    line.unmount()
  })

  it('commits Max grid size as a single step on Enter', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const input = rowByLabel(container, 'Max grid size')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '120'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSet).toHaveBeenCalledWith('max_grids', 'real', 120)
    unmount()
  })

  // The cap faces close the surface at the edge of the displayed region.
  // Auto keeps the historical coupling to the region policy (full closes, box
  // does not); On is the useful one for figures in the box region, where an
  // open edge shows the surface's back face through the hole.
  it('writes cap_mode as raw enum ids in Auto / On / Off order', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const sel = rowByLabel(container, 'Cap mode')!.querySelector('select') as HTMLSelectElement
    // The C++ enumdef is alphabetical (auto/off/on); the row fixes the order.
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['auto', 'on', 'off'])
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['Auto', 'On', 'Off'])
    expect(sel.value).toBe('auto')

    selectValue(sel, 'on')
    expect(onSet).toHaveBeenCalledWith('cap_mode', 'enum', 'on')
    unmount()
  })

  // The map kind comes from the parent DensityMap and is only ever read, so
  // it is static text rather than a disabled control.
  it('shows the resolved map kind as static text with no control', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries({ mapKind: 'em' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const row = rowByLabel(container, 'Map kind')!
    expect(row.querySelector('.insp-prop-readonly')?.textContent).toBe('Cryo-EM')
    expect(row.querySelector('input, select, button')).toBeNull()
    unmount()
  })

  // A scalar object that is not a DensityMap (an ElePotMap) has no map kind
  // and reports an empty string; an empty row would read as a failed load.
  it('drops the Map kind row when nothing resolved', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries({ mapKind: '' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(rowByLabel(container, 'Map kind')).toBeNull()
    unmount()
  })

  it('toggles Back-face culling', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    act(() => switchIn(rowByLabel(container, 'Back-face culling')!).click())
    expect(onSet).toHaveBeenCalledWith('cullface', 'boolean', true)
    unmount()
  })

  it('writes the autoupdate/dragupdate pair in one step (shared Center update)', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries()} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} nodeId={2} />,
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
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries({ bndryMol: 'molX' })} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    act(() => switchIn(rowByLabel(container, 'Limit display by')!).click())
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'bndry_molname', valueType: 'string', value: '' },
      { key: 'bndry_sel', valueType: 'object<MolSelection>', value: '' },
    ])
    unmount()
  })

  it('lets the Limit toggle turn on even with no molecule available (no dead-lock)', () => {
    // cm is null -> the molecule list is empty; the toggle must still turn on so
    // the Target selector becomes usable once a molecule appears.
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries({ bndryMol: '' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const toggle = switchIn(rowByLabel(container, 'Limit display by')!)
    expect(toggle.checked).toBe(false)
    expect((rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement).disabled).toBe(true)
    act(() => toggle.click())
    expect(switchIn(rowByLabel(container, 'Limit display by')!).checked).toBe(true)
    expect((rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement).disabled).toBe(false)
    unmount()
  })

  it('disables Target / Selection / Distance when limiting is off', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={ISOSURF_SECTIONS[0]} rendererType="isosurf" entries={isosurfEntries({ bndryMol: '' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect((rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement).disabled).toBe(true)
    expect(
      (rowByLabel(container, 'Selection')!.querySelector('[data-testid="sel"]') as HTMLElement).getAttribute('data-disabled'),
    ).toBe('true')
    expect(rowByLabel(container, 'Distance')!.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    unmount()
  })
})
