/**
 * Direct-surface (DirectSurfRenderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `dsurface` renderer's inspector page
 * migrated from the UXP `dsurf-propdlg` "MolSurf" + "Atom radii" tabs. Only the
 * controls the UXP dialog actually exposes for dsurface are surfaced.
 *
 * The pins:
 *   - the registry resolves `type_name === "dsurface"` to two default-expanded
 *     sections (Surface / Atom radii);
 *   - each row renders only when its property exists;
 *   - "Detail" is a SliderField row (slider + number box, no drag arrows) and
 *     commits a single-step integer `onSet`;
 *   - a drag-numeric row (Line/Point size) commits a plain single step (no
 *     realtime opts);
 *   - the "Line/Point size" row is disabled while draw mode is "fill";
 *   - a MappedEnumRow (Surface type) shows friendly labels but commits the raw
 *     C++ enum string ID.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// rendererPropSections imports sibling sections (e.g. the atomintr page)
// whose rows pull in useCueMol and the colour leaf; stub both so the registry
// import collects without the real worker / ColorPicker context.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
  CueColorField: ({ value, onCommit, disabled }: any) => (
    <button
      data-testid="color"
      data-disabled={String(!!disabled)}
      onClick={() => onCommit('red')}
    >
      {value}
    </button>
  ),
}))

import { SchemaSection } from '../components/inspector/SchemaSection'
import { DSURFACE_SECTIONS } from '../components/inspector/schema/dsurface'
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
/** The right step arrow of a drag-numeric row (present only for DragNumericField). */
function dragArrow(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector('.h3-form-drag-arrow-right') as HTMLButtonElement | null
}

function mainEntries(drawmode = 'line'): GenericPropEntry[] {
  return [
    entry({
      key: 'drawmode',
      type: 'enum',
      value: drawmode,
      enumdef: ['fill', 'line', 'point'],
    }),
    entry({ key: 'width', type: 'real', value: 1.2 }),
    entry({ key: 'surftype', type: 'enum', value: 'ses', enumdef: ['vdw', 'sas', 'ses'] }),
    entry({ key: 'detail', type: 'integer', value: 6 }),
  ]
}

function radiiEntries(): GenericPropEntry[] {
  return [
    entry({ key: 'vdwr_C', type: 'real', value: 1.7 }),
    entry({ key: 'vdwr_N', type: 'real', value: 1.55 }),
    entry({ key: 'vdwr_O', type: 'real', value: 1.52 }),
    entry({ key: 'vdwr_S', type: 'real', value: 1.8 }),
    entry({ key: 'vdwr_P', type: 'real', value: 1.8 }),
    entry({ key: 'vdwr_H', type: 'real', value: 1.2 }),
    entry({ key: 'vdwr_X', type: 'real', value: 1.7 }),
  ]
}

describe('Direct-surface renderer section registry', () => {
  it('resolves type_name "dsurface" to two default-expanded sections', () => {
    const sections = getRendererPropSections('dsurface')
    expect(sections.map((s) => s.title)).toEqual(['Surface', 'Atom radii'])
    expect(sections.every((s) => s.defaultExpanded)).toBe(true)
    expect(RENDERER_SECTION_REGISTRY.dsurface).toBe(sections)
  })
})

describe('the direct-surface Surface section', () => {
  it('renders the curated rows when present', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries()}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(rowByLabel(container, 'Drawing mode')).not.toBeNull()
    expect(rowByLabel(container, 'Line/Point size')).not.toBeNull()
    expect(rowByLabel(container, 'Surface type')).not.toBeNull()
    expect(rowByLabel(container, 'Detail')).not.toBeNull()
    unmount()
  })

  it('omits a row when its property is absent', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={[entry({ key: 'detail', type: 'integer', value: 6 })]}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(rowByLabel(container, 'Detail')).not.toBeNull()
    expect(rowByLabel(container, 'Surface type')).toBeNull()
    expect(rowByLabel(container, 'Drawing mode')).toBeNull()
    unmount()
  })

  it('offers Detail as a ladder of levels, including the C++ default', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries()}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const detail = rowByLabel(container, 'Detail')!
    expect(dragArrow(detail)).toBeNull()
    const sel = detail.querySelector('select') as HTMLSelectElement
    // Powers of two from 1 up, plus the default 6 the property carries.
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['1', '2', '4', '6', '8', '16', '32'])
    expect(sel.value).toBe('6')
    unmount()
  })

  it('commits the chosen Detail level as an integer', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries()}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const sel = rowByLabel(container, 'Detail')!.querySelector('select') as HTMLSelectElement
    act(() => {
      sel.value = '8'
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('detail', 'integer', 8)
    unmount()
  })

  it('commits a drag-numeric row as a plain single step (Line/Point size)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries('line')}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const incr = dragArrow(rowByLabel(container, 'Line/Point size')!)!
    pressStepArrow(incr)
    // step 0.1 from 1.2 -> 1.3, committed as a plain single step (no realtime opts).
    expect(onSet).toHaveBeenCalledWith('width', 'real', 1.3)
    unmount()
  })

  it('disables the Line/Point size row while draw mode is "fill"', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries('fill')}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const drag = rowByLabel(container, 'Line/Point size')!.querySelector('.h3-form-drag')!
    expect(drag.classList.contains('h3-form-drag-disabled')).toBe(true)
    unmount()
  })

  it('enables the Line/Point size row in line / point draw modes', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries('line')}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const drag = rowByLabel(container, 'Line/Point size')!.querySelector('.h3-form-drag')!
    expect(drag.classList.contains('h3-form-drag-disabled')).toBe(false)
    unmount()
  })

  it('shows friendly enum labels but commits the raw enum ID (Surface type)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries()}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const select = rowByLabel(container, 'Surface type')!.querySelector(
      'select',
    ) as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual(['van der Waals', 'Solvent accessible', 'Solvent excluded'])
    expect(select.value).toBe('ses')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      )!.set!
      setter.call(select, 'vdw')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('surftype', 'enum', 'vdw')
    unmount()
  })

  // Degrade guard for the shared-MappedEnumRow extraction (theme T4 Step 1):
  // the Drawing-mode dropdown must keep its friendly DRAWMODE_LABELS while
  // committing the raw enum ID. Pinned before the local row is swapped for the
  // exported one so the option text contract is held byte-identical.
  it('shows friendly DRAWMODE_LABELS but commits the raw enum ID (Drawing mode)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[0]}
        entries={mainEntries()}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const select = rowByLabel(container, 'Drawing mode')!.querySelector(
      'select',
    ) as HTMLSelectElement
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toEqual(['Fill', 'Wireframe', 'Dots'])
    expect(select.value).toBe('line')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      )!.set!
      setter.call(select, 'point')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('drawmode', 'enum', 'point')
    unmount()
  })
})

describe('the direct-surface Atom radii section', () => {
  it('renders the seven per-element radius rows in tab order', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DSURFACE_SECTIONS[1]}
        entries={radiiEntries()}
        rendererType="dsurface"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    for (const label of [
      'Carbon',
      'Nitrogen',
      'Oxygen',
      'Sulfur',
      'Phosphorus',
      'Hydrogen',
      'Others',
    ]) {
      expect(rowByLabel(container, label)).not.toBeNull()
    }
    unmount()
  })
})
