/**
 * Tube (TubeRenderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `tube` renderer's inspector page migrated
 * from the UXP `tube-propdlg` "Tube" tab.
 *
 * The pins:
 *   - the registry resolves `type_name === "tube"` to the Tube / Section / Putty
 *     sections (all default-expanded);
 *   - each section renders a row only when its property exists;
 *   - `axialdetail` / `section.detail` use the plain stepper NumericField;
 *   - the nested `section.*` cross-section props are surfaced (via their dot-path
 *     keys) and committed unchanged through `onSet`;
 *   - "Width2" is derived (`tuber * width`) and writes back `section.tuber`;
 *   - sharpness is gated by `section.type` (square / fancy only);
 *   - putty target / scales are gated by `putty_mode` ("none" disables them).
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// The common page's Material row fetches names through useCueMol (pulled in
// transitively via the rendererPropSections registry import).
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

import { SchemaSection } from '../components/inspector/SchemaSection'
import { TUBE_SECTIONS } from '../components/inspector/schema/tube'
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

/** Find the property row (.h3-form-prop-row) whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

/** The right step arrow of a drag-numeric row (present only for DragNumericField). */
function dragArrow(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector('.h3-form-drag-arrow-right') as HTMLButtonElement | null
}

function selectIn(row: HTMLElement): HTMLSelectElement {
  return row.querySelector('select') as HTMLSelectElement
}

describe('Tube renderer section registry', () => {
  it('resolves type_name "tube" to Tube / Section / Putty sections', () => {
    const sections = getRendererPropSections('tube')
    expect(sections.map((s) => s.title)).toEqual(['Tube', 'Section', 'Putty'])
    expect(sections.every((s) => s.defaultExpanded)).toBe(true)
    expect(sections).toBe(TUBE_SECTIONS)
    expect(RENDERER_SECTION_REGISTRY.tube).toBe(sections)
  })
})

describe('the tube page', () => {
  function mainEntries(): GenericPropEntry[] {
    return [
      entry({ key: 'axialdetail', type: 'integer', value: 6 }),
      entry({ key: 'smooth', type: 'real', value: 0.1 }),
      entry({ key: 'smoothcolor', type: 'boolean', value: true }),
      entry({ key: 'start_captype', type: 'enum', value: 'sphere', enumdef: ['sphere', 'flat', 'none'] }),
      entry({ key: 'end_captype', type: 'enum', value: 'sphere', enumdef: ['sphere', 'flat', 'none'] }),
      entry({ key: 'segend_fade', type: 'boolean', value: false }),
      entry({ key: 'pivotatom', type: 'string', value: '' }),
    ]
  }

  it('renders the curated rows when present', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={TUBE_SECTIONS[0]} rendererType="tube" entries={mainEntries()} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(rowByLabel(container, 'Axial detail')).not.toBeNull()
    expect(rowByLabel(container, 'Smoothness')).not.toBeNull()
    expect(rowByLabel(container, 'Smooth color')).not.toBeNull()
    expect(rowByLabel(container, 'Start cap')).not.toBeNull()
    expect(rowByLabel(container, 'End cap')).not.toBeNull()
    expect(rowByLabel(container, 'Segment-end fade out')).not.toBeNull()
    expect(rowByLabel(container, 'Pivot atom name')).not.toBeNull()
    unmount()
  })

  it('renders Axial detail as a stepper (no slider, no drag arrows)', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={TUBE_SECTIONS[0]} rendererType="tube" entries={mainEntries()} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    const detail = rowByLabel(container, 'Axial detail')!
    expect(detail.querySelector('.h3-form-numeric-row')).not.toBeNull()
    expect(detail.querySelector('.h3-form-slider')).toBeNull()
    expect(dragArrow(detail)).toBeNull()
    unmount()
  })

  it('commits a cap-type enum as its raw C++ string ID', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={TUBE_SECTIONS[0]} rendererType="tube" entries={mainEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} />,
    )
    const sel = selectIn(rowByLabel(container, 'Start cap')!)
    act(() => {
      sel.value = 'flat'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('start_captype', 'enum', 'flat')
    unmount()
  })
})

describe('the tube Section page', () => {
  function sectionEntries(type: string): GenericPropEntry[] {
    return [
      entry({ key: 'section.type', type: 'enum', value: type, enumdef: ['elliptical', 'roundsquare', 'rectangle', 'fancy1'], depth: 1 }),
      entry({ key: 'section.detail', type: 'integer', value: 16, depth: 1 }),
      entry({ key: 'section.width', type: 'real', value: 2, depth: 1 }),
      entry({ key: 'section.tuber', type: 'real', value: 0.5, depth: 1 }),
      entry({ key: 'section.sharp', type: 'real', value: 0.4, depth: 1 }),
    ]
  }

  it('renders the cross-section rows including the derived Width2', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={TUBE_SECTIONS[1]} rendererType="tube" entries={sectionEntries('roundsquare')} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(rowByLabel(container, 'Type')).not.toBeNull()
    expect(rowByLabel(container, 'Detail')).not.toBeNull()
    expect(rowByLabel(container, 'Width1')).not.toBeNull()
    expect(rowByLabel(container, 'Width2')).not.toBeNull()
    expect(rowByLabel(container, 'Sharpness')).not.toBeNull()
    unmount()
  })

  it('disables Sharpness for elliptical and enables it for roundsquare', () => {
    const ell = mountTree(
      <SchemaSection section={TUBE_SECTIONS[1]} rendererType="tube" entries={sectionEntries('elliptical')} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(dragArrow(rowByLabel(ell.container, 'Sharpness')!)!.disabled).toBe(true)
    ell.unmount()

    const rsq = mountTree(
      <SchemaSection section={TUBE_SECTIONS[1]} rendererType="tube" entries={sectionEntries('roundsquare')} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(dragArrow(rowByLabel(rsq.container, 'Sharpness')!)!.disabled).toBe(false)
    rsq.unmount()
  })

  it('writes section.tuber when Width2 is edited (tuber = Width2 / Width1)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={TUBE_SECTIONS[1]} rendererType="tube" entries={sectionEntries('roundsquare')} onSet={onSet} onReset={vi.fn()} sceneId={1} />,
    )
    // committed Width2 = tuber * width = 0.5 * 2 = 1; step 0.01 -> 1.01.
    const incr = dragArrow(rowByLabel(container, 'Width2')!)!
    pressStepArrow(incr)
    // tuber = 1.01 / 2 = 0.505.
    expect(onSet).toHaveBeenCalledWith('section.tuber', 'real', expect.closeTo(0.505, 5))
    unmount()
  })

  it('rewrites width + tuber together on Width1 edit so Width2 stays put', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={TUBE_SECTIONS[1]}
        rendererType="tube"
        entries={sectionEntries('roundsquare')}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    // width=2, tuber=0.5 -> minor axis (Width2) = 1. Bump Width1 2 -> 2.01.
    const incr = dragArrow(rowByLabel(container, 'Width1')!)!
    pressStepArrow(incr)
    expect(onSetMany).toHaveBeenCalledTimes(1)
    const writes = onSetMany.mock.calls[0][0]
    expect(writes[0]).toMatchObject({ key: 'section.width', valueType: 'real' })
    expect(writes[0].value).toBeCloseTo(2.01, 5)
    expect(writes[1]).toMatchObject({ key: 'section.tuber', valueType: 'real' })
    // tuber rewritten so width * tuber keeps the original minor axis (1).
    expect(writes[1].value).toBeCloseTo(1 / 2.01, 5)
    expect(writes[0].value * writes[1].value).toBeCloseTo(1, 5)
    unmount()
  })

  it('leaves section.width untouched when only Width2 is edited (axes independent)', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={TUBE_SECTIONS[1]}
        rendererType="tube"
        entries={sectionEntries('roundsquare')}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = dragArrow(rowByLabel(container, 'Width2')!)!
    pressStepArrow(incr)
    // Only the ratio moves; the major axis (Width1) is never written.
    expect(onSet).toHaveBeenCalledWith('section.tuber', 'real', expect.closeTo(0.505, 5))
    expect(onSet).not.toHaveBeenCalledWith('section.width', expect.anything(), expect.anything())
    expect(onSetMany).not.toHaveBeenCalled()
    unmount()
  })
})

describe('the tube Putty page, gated on its mode', () => {
  function puttyEntries(mode: string): GenericPropEntry[] {
    return [
      entry({ key: 'putty_mode', type: 'enum', value: mode, enumdef: ['none', 'linear1', 'scale1'] }),
      entry({ key: 'putty_tgt', type: 'enum', value: 'bfac', enumdef: ['bfac', 'occ'] }),
      entry({ key: 'putty_loscl', type: 'real', value: 3 }),
      entry({ key: 'putty_hiscl', type: 'real', value: 3 }),
    ]
  }

  it('disables target / scales when mode is "none"', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={TUBE_SECTIONS[2]} rendererType="tube" entries={puttyEntries('none')} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(selectIn(rowByLabel(container, 'Target')!).disabled).toBe(true)
    expect(dragArrow(rowByLabel(container, 'Low scale')!)!.disabled).toBe(true)
    expect(dragArrow(rowByLabel(container, 'High scale')!)!.disabled).toBe(true)
    unmount()
  })

  it('enables target / scales for a non-none mode', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={TUBE_SECTIONS[2]} rendererType="tube" entries={puttyEntries('scale1')} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(selectIn(rowByLabel(container, 'Target')!).disabled).toBe(false)
    expect(dragArrow(rowByLabel(container, 'Low scale')!)!.disabled).toBe(false)
    expect(dragArrow(rowByLabel(container, 'High scale')!)!.disabled).toBe(false)
    unmount()
  })
})
