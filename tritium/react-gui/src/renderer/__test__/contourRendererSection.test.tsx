/**
 * Contour (MapMeshRenderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `contour` renderer's inspector page
 * migrated from the UXP `contour-propdlg` "Map" tab.
 *
 * The pins:
 *   - the registry resolves `type_name === "contour"` to a single "Contour"
 *     section (default-expanded);
 *   - the curated rows render (Center update / Line width / Buffer size / Use
 *     periodic boundary / Target / Selection / Distance) and unrelated props
 *     (coloring) are ignored;
 *   - "Center update" writes the `autoupdate` / `dragupdate` boolean pair in one
 *     undo step (onSetMany) per tri-state choice;
 *   - "Line width" commits a plain single drag step; "Buffer size" commits a
 *     single-step integer;
 *   - the display-limit Selection / Distance are disabled until a Target
 *     molecule is chosen (empty `bndry_molname` = limiting off);
 *   - the Target selector always offers "(none)" and keeps the current value
 *     selectable.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// ContourMainSection -> LimitTargetRow uses useCueMol; null cm keeps the name
// list empty (the current value stays selectable).
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

// Stub MolSelList (used by the Selection SelRow) to avoid the real picker's
// ThemeProvider / hit-count dependencies.
vi.mock('../h3-kit/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel, onCommit, disabled }: any) => (
    <button data-testid="sel" data-disabled={String(!!disabled)} onClick={() => onCommit?.('newsel')}>
      {selectedSel}
    </button>
  ),
}))

import { ContourMainSection } from '../components/inspector/ContourRendererSection'
import {
  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
} from '../components/inspector/rendererPropSections'

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

/** Find the property row whose label text matches. */
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

/** Set a controlled <select> value so React's value tracker fires onChange. */
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

/** The right step arrow of a drag-numeric row. */
function dragArrow(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector('.h3-form-drag-arrow-right') as HTMLButtonElement | null
}

function contourEntries(over?: {
  autoupdate?: boolean
  dragupdate?: boolean
  bndryMol?: string
}): GenericPropEntry[] {
  return [
    entry({ key: 'autoupdate', type: 'boolean', value: over?.autoupdate ?? true }),
    entry({ key: 'dragupdate', type: 'boolean', value: over?.dragupdate ?? false }),
    entry({ key: 'width', type: 'real', value: 1.0 }),
    entry({ key: 'bufsize', type: 'integer', value: 100 }),
    entry({ key: 'use_pbc', type: 'boolean', value: true }),
    entry({ key: 'bndry_molname', type: 'string', value: over?.bndryMol ?? '' }),
    entry({ key: 'bndry_sel', type: 'object<MolSelection>', value: '' }),
    entry({ key: 'bndry_rng', type: 'real', value: 5.0 }),
  ]
}

describe('Contour renderer section registry', () => {
  it('resolves type_name "contour" to a single default-expanded "Contour" section', () => {
    const sections = getRendererPropSections('contour')
    expect(sections.map((s) => s.title)).toEqual(['Contour'])
    expect(sections[0].defaultExpanded).toBe(true)
    expect(sections[0].Component).toBe(ContourMainSection)
    expect(RENDERER_SECTION_REGISTRY.contour).toBe(sections)
  })
})

describe('ContourMainSection', () => {
  it('renders the curated rows and ignores unrelated (coloring) props', () => {
    const entries = [
      ...contourEntries(),
      // Coloring props are present on the renderer but not on the UXP Map tab.
      entry({ key: 'colormode', type: 'enum', value: 'solid', enumdef: ['solid'] }),
      entry({ key: 'siglevel', type: 'real', value: 1.1 }),
    ]
    const { container, unmount } = mountTree(
      <ContourMainSection entries={entries} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(rowByLabel(container, 'Center update')).not.toBeNull()
    expect(rowByLabel(container, 'Line width')).not.toBeNull()
    expect(rowByLabel(container, 'Buffer size')).not.toBeNull()
    expect(rowByLabel(container, 'Use periodic boundary')).not.toBeNull()
    expect(rowByLabel(container, 'Target')).not.toBeNull()
    expect(rowByLabel(container, 'Selection')).not.toBeNull()
    expect(rowByLabel(container, 'Distance')).not.toBeNull()
    // Exactly the seven curated rows -- coloring props produce no row.
    expect(container.querySelectorAll('.h3-form-prop-row').length).toBe(7)
    unmount()
  })

  it('writes the autoupdate/dragupdate pair in one step for each Center-update choice', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <ContourMainSection
        entries={contourEntries({ autoupdate: true, dragupdate: false })}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    const select = rowByLabel(container, 'Center update')!.querySelector('select') as HTMLSelectElement
    // Default-derived display is "auto" (autoupdate=true, dragupdate=false).
    expect(select.value).toBe('auto')

    selectValue(select, 'drag')
    expect(onSetMany).toHaveBeenLastCalledWith([
      { key: 'autoupdate', valueType: 'boolean', value: true },
      { key: 'dragupdate', valueType: 'boolean', value: true },
    ])

    selectValue(select, 'none')
    expect(onSetMany).toHaveBeenLastCalledWith([
      { key: 'autoupdate', valueType: 'boolean', value: false },
      { key: 'dragupdate', valueType: 'boolean', value: false },
    ])
    unmount()
  })

  it('derives the Center-update display from the boolean pair (drag)', () => {
    const { container, unmount } = mountTree(
      <ContourMainSection
        entries={contourEntries({ autoupdate: true, dragupdate: true })}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    const select = rowByLabel(container, 'Center update')!.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('drag')
    unmount()
  })

  it('commits Line width as a plain single drag step', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <ContourMainSection entries={contourEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    pressStepArrow(dragArrow(rowByLabel(container, 'Line width')!)!)
    // step 0.1 from 1.0 -> 1.1, plain single step (no realtime opts).
    expect(onSet).toHaveBeenCalledWith('width', 'real', 1.1)
    unmount()
  })

  it('commits Buffer size as a single-step integer on Enter', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <ContourMainSection entries={contourEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const input = rowByLabel(container, 'Buffer size')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '120'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSet).toHaveBeenCalledWith('bufsize', 'integer', 120)
    unmount()
  })

  it('disables Selection / Distance when no Target molecule is set', () => {
    const { container, unmount } = mountTree(
      <ContourMainSection
        entries={contourEntries({ bndryMol: '' })}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    const sel = rowByLabel(container, 'Selection')!.querySelector('[data-testid="sel"]') as HTMLElement
    expect(sel.getAttribute('data-disabled')).toBe('true')
    expect(rowByLabel(container, 'Distance')!.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    unmount()
  })

  it('enables Selection / Distance once a Target molecule is set', () => {
    const { container, unmount } = mountTree(
      <ContourMainSection
        entries={contourEntries({ bndryMol: 'mol1' })}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    const sel = rowByLabel(container, 'Selection')!.querySelector('[data-testid="sel"]') as HTMLElement
    expect(sel.getAttribute('data-disabled')).toBe('false')
    expect(rowByLabel(container, 'Distance')!.querySelector('.h3-form-drag-disabled')).toBeNull()
    unmount()
  })

  it('offers "(none)" and keeps the current Target value selectable', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <ContourMainSection
        entries={contourEntries({ bndryMol: 'mol1' })}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    const select = rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('')
    expect(values).toContain('mol1')
    expect(select.value).toBe('mol1')
    selectValue(select, '')
    expect(onSet).toHaveBeenCalledWith('bndry_molname', 'string', '')
    unmount()
  })
})
