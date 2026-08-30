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
 *     periodic boundary / Limit display by / Target / Selection / Distance) and
 *     unrelated props (coloring) are ignored;
 *   - "Center update" writes the `autoupdate` / `dragupdate` boolean pair in one
 *     undo step (onSetMany) per tri-state choice;
 *   - "Line width" commits a realtime single drag step; "Buffer size" commits a
 *     single-step integer;
 *   - "Limit display by" is checked iff a target molecule is set; turning it off
 *     clears `bndry_molname` + `bndry_sel` together, turning it on commits the
 *     first available molecule; Target / Selection / Distance are disabled while
 *     it is off; the Target selector lists molecules only (no "(none)" entry).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow, flushPromises } from '@renderer/__test__/helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// Mutable cm holder: most tests run with cm=null (the name list stays empty);
// the tests that exercise the molecule target set a stub cm that resolves
// `listSceneObjects` to one MolCoord object.
const state = vi.hoisted(() => ({ cm: null as unknown }))

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: state.cm, cueMolReady: !!state.cm }),
}))

// Stub MolSelList (used by the Selection SelRow) to avoid the real picker's
// ThemeProvider / hit-count dependencies.
vi.mock('@renderer/h3-kit/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel, onCommit, disabled }: any) => (
    <button data-testid="sel" data-disabled={String(!!disabled)} onClick={() => onCommit?.('newsel')}>
      {selectedSel}
    </button>
  ),
}))

import { SchemaSection } from '@renderer/features/inspector/SchemaSection'
import { CONTOUR_SECTIONS, GPU_MAPMESH_SECTIONS } from '@renderer/features/inspector/schema/map'
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

/** Stub cm whose `listSceneObjects` resolves to one MolCoord object. */
function stubCmWithMol(name = 'molA') {
  state.cm = {
    invokeService: vi.fn((svc: string) =>
      svc === 'listSceneObjects'
        ? Promise.resolve({ objects: [{ uid: 1, name, className: 'MolCoord' }] })
        : Promise.resolve(undefined),
    ),
  }
}

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

/** The switch checkbox inside a labelled row. */
function switchIn(row: HTMLElement): HTMLInputElement {
  return row.querySelector('input[type="checkbox"]') as HTMLInputElement
}

function contourEntries(over?: {
  autoupdate?: boolean
  dragupdate?: boolean
  bndryMol?: string
  regionResolved?: string
}): GenericPropEntry[] {
  return [
    entry({ key: 'autoupdate', type: 'boolean', value: over?.autoupdate ?? true }),
    entry({ key: 'dragupdate', type: 'boolean', value: over?.dragupdate ?? false }),
    entry({ key: 'region_mode', type: 'enum', value: 'auto', enumdef: ['auto', 'box', 'full'] }),
    entry({ key: 'region_mode_resolved', type: 'string', value: over?.regionResolved ?? 'box', readonly: true }),
    entry({ key: 'lod', type: 'enum', value: 'auto', enumdef: ['auto', 'step1', 'step2', 'step4', 'step8'] }),
    entry({ key: 'lod_budget', type: 'integer', value: 2 }),
    entry({ key: 'zoom_refine', type: 'boolean', value: true }),
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
    expect(sections).toBe(CONTOUR_SECTIONS)
    expect(RENDERER_SECTION_REGISTRY.contour).toBe(sections)
  })

  it('reuses the contour section for the GPU contour renderer ("gpu_mapmesh")', () => {
    const sections = getRendererPropSections('gpu_mapmesh')
    expect(sections.map((s) => s.title)).toEqual(['GPU contour'])
    expect(sections[0].defaultExpanded).toBe(true)
    expect(sections).toBe(GPU_MAPMESH_SECTIONS)
    // The same rows under its own title.
    expect(GPU_MAPMESH_SECTIONS[0].rows).toEqual(CONTOUR_SECTIONS[0].rows)
  })
})

describe('the contour page', () => {
  it('renders the curated rows and ignores unrelated (coloring) props', () => {
    const entries = [
      ...contourEntries(),
      // Coloring props are present on the renderer but not on the UXP Map tab.
      entry({ key: 'colormode', type: 'enum', value: 'solid', enumdef: ['solid'] }),
      entry({ key: 'siglevel', type: 'real', value: 1.1 }),
    ]
    const { container, unmount } = mountTree(
      <SchemaSection section={CONTOUR_SECTIONS[0]} rendererType="contour" entries={entries} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(rowByLabel(container, 'Center update')).not.toBeNull()
    expect(rowByLabel(container, 'Region')).not.toBeNull()
    expect(rowByLabel(container, 'Level of detail')).not.toBeNull()
    expect(rowByLabel(container, 'Line width')).not.toBeNull()
    expect(rowByLabel(container, 'Buffer size')).not.toBeNull()
    expect(rowByLabel(container, 'Use periodic boundary')).not.toBeNull()
    expect(rowByLabel(container, 'Limit display by')).not.toBeNull()
    expect(rowByLabel(container, 'Target')).not.toBeNull()
    expect(rowByLabel(container, 'Selection')).not.toBeNull()
    expect(rowByLabel(container, 'Distance')).not.toBeNull()
    // The LoD budget and the zoom refinement only apply to the full region.
    expect(rowByLabel(container, 'LoD budget')).toBeNull()
    expect(rowByLabel(container, 'Refine on zoom')).toBeNull()
    // Exactly the ten curated rows -- coloring props produce no row.
    expect(container.querySelectorAll('.h3-form-prop-row').length).toBe(10)
    unmount()
  })

  it('hides the box-only rows and shows the LoD budget / zoom refinement in the full region', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
        entries={contourEntries({ regionResolved: 'full' })}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    expect(rowByLabel(container, 'Buffer size')).toBeNull()
    expect(rowByLabel(container, 'Use periodic boundary')).toBeNull()
    expect(rowByLabel(container, 'LoD budget')).not.toBeNull()
    const refine = rowByLabel(container, 'Refine on zoom')
    expect(refine).not.toBeNull()
    act(() => switchIn(refine!).click())
    expect(onSet).toHaveBeenCalledWith('zoom_refine', 'boolean', false)
    unmount()
  })

  it('writes the autoupdate/dragupdate pair in one step for each Center-update choice', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
        entries={contourEntries({ autoupdate: true, dragupdate: false })}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    const select = rowByLabel(container, 'Center update')!.querySelector('select') as HTMLSelectElement
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
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
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

  it('commits Line width as a realtime single drag step', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={CONTOUR_SECTIONS[0]} rendererType="contour" entries={contourEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    pressStepArrow(dragArrow(rowByLabel(container, 'Line width')!)!)
    // step 0.1 from 1.0 -> 1.1, committed live (preview restored to original first).
    expect(onSet).toHaveBeenCalledWith('width', 'real', 1.1, {
      mode: 'commit',
      originalValue: 1.0,
      originalWasDefault: false,
    })
    unmount()
  })

  it('commits Buffer size as a single-step integer on Enter', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={CONTOUR_SECTIONS[0]} rendererType="contour" entries={contourEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    const input = rowByLabel(container, 'Buffer size')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '120'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSet).toHaveBeenCalledWith('bufsize', 'integer', 120)
    unmount()
  })

  it('checks "Limit display by" iff a target molecule is set', () => {
    const off = mountTree(
      <SchemaSection section={CONTOUR_SECTIONS[0]} rendererType="contour" entries={contourEntries({ bndryMol: '' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(switchIn(rowByLabel(off.container, 'Limit display by')!).checked).toBe(false)
    off.unmount()

    const on = mountTree(
      <SchemaSection section={CONTOUR_SECTIONS[0]} rendererType="contour" entries={contourEntries({ bndryMol: 'molX' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
    )
    expect(switchIn(rowByLabel(on.container, 'Limit display by')!).checked).toBe(true)
    on.unmount()
  })

  it('clears target + selection in one step when "Limit display by" is turned off', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
        entries={contourEntries({ bndryMol: 'molX' })}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    act(() => switchIn(rowByLabel(container, 'Limit display by')!).click())
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'bndry_molname', valueType: 'string', value: '' },
      { key: 'bndry_sel', valueType: 'object<MolSelection>', value: '' },
    ])
    unmount()
  })

  it('commits the first molecule as the target when "Limit display by" is turned on', async () => {
    stubCmWithMol('molA')
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
        entries={contourEntries({ bndryMol: '' })}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    await act(async () => {
      await flushPromises()
    })
    act(() => switchIn(rowByLabel(container, 'Limit display by')!).click())
    expect(onSet).toHaveBeenCalledWith('bndry_molname', 'string', 'molA')
    unmount()
  })

  it('lets the Limit toggle turn on even with no molecule available (no dead-lock)', () => {
    // cm is null -> the molecule list is empty; the toggle must still turn on so
    // the Target selector becomes usable once a molecule appears.
    const { container, unmount } = mountTree(
      <SchemaSection section={CONTOUR_SECTIONS[0]} rendererType="contour" entries={contourEntries({ bndryMol: '' })} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} nodeId={2} />,
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
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
        entries={contourEntries({ bndryMol: '' })}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    expect((rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement).disabled).toBe(true)
    expect(
      (rowByLabel(container, 'Selection')!.querySelector('[data-testid="sel"]') as HTMLElement).getAttribute('data-disabled'),
    ).toBe('true')
    expect(rowByLabel(container, 'Distance')!.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    unmount()
  })

  it('enables Target / Selection / Distance when a target is set', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
        entries={contourEntries({ bndryMol: 'molX' })}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    expect((rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement).disabled).toBe(false)
    expect(
      (rowByLabel(container, 'Selection')!.querySelector('[data-testid="sel"]') as HTMLElement).getAttribute('data-disabled'),
    ).toBe('false')
    expect(rowByLabel(container, 'Distance')!.querySelector('.h3-form-drag-disabled')).toBeNull()
    unmount()
  })

  it('lists molecules in the Target selector with no "(none)" entry', async () => {
    stubCmWithMol('molA')
    const { container, unmount } = mountTree(
      <SchemaSection
        section={CONTOUR_SECTIONS[0]}
        rendererType="contour"
        entries={contourEntries({ bndryMol: 'molA' })}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
        nodeId={2}
      />,
    )
    await act(async () => {
      await flushPromises()
    })
    const select = rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(['molA'])
    expect(select.value).toBe('molA')
    unmount()
  })
})
