/**
 * Cartoon (Ribbon2Renderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `cartoon` renderer's inspector page
 * migrated from the UXP `cartoon-propdlg` tabs. Only the editable top-level
 * properties are surfaced; the read-only nested section-shape sub-objects
 * (TubeSection / JctTable) stay in the Generic tab.
 *
 * The pins:
 *   - the registry resolves `type_name === "cartoon"` to the Cartoon / Helix /
 *     Sheet / Coil sections (all default-expanded);
 *   - each section renders a row only when its property exists;
 *   - `axialdetail` ("Detail") uses the plain NumericField (slider + numeric),
 *     not the drag-numeric field, and commits a single-step `onSet`;
 *   - a drag-numeric row commits a plain single-step `onSet` (no realtime opts);
 *   - the helix width params are gated by `helix_width_mode` (constant width only
 *     for "const"; width-plus only for non-const; width smoothing only "wavy");
 *   - PropertiesTab shows the four sections (no placeholder) for `cartoon`, and
 *     the nested shape sub-objects (e.g. `helix`) are not surfaced as rows.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

import {
  CartoonMainSection,
  CartoonHelixSection,
  CartoonSheetSection,
  CartoonCoilSection,
} from '../components/inspector/CartoonRendererSection'
import {
  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
} from '../components/inspector/rendererPropSections'
import { PropertiesTab } from '../components/inspector/PropertiesTab'

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

/** The right step arrow of a drag-numeric row (present only for DragNumericField). */
function dragArrow(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector('.h3-form-drag-arrow-right') as HTMLButtonElement | null
}

describe('Cartoon renderer section registry', () => {
  it('resolves type_name "cartoon" to Cartoon / Helix / Sheet / Coil sections', () => {
    const sections = getRendererPropSections('cartoon')
    expect(sections.map((s) => s.title)).toEqual(['Cartoon', 'Helix', 'Sheet', 'Coil'])
    expect(sections.every((s) => s.defaultExpanded)).toBe(true)
    expect(sections[0].Component).toBe(CartoonMainSection)
    expect(sections[1].Component).toBe(CartoonHelixSection)
    expect(sections[2].Component).toBe(CartoonSheetSection)
    expect(sections[3].Component).toBe(CartoonCoilSection)
    expect(RENDERER_SECTION_REGISTRY.cartoon).toBe(sections)
  })
})

describe('CartoonMainSection', () => {
  function mainEntries(): GenericPropEntry[] {
    return [
      entry({ key: 'axialdetail', type: 'integer', value: 8 }),
      entry({ key: 'smoothcolor', type: 'boolean', value: false }),
      entry({
        key: 'start_captype',
        type: 'enum',
        value: 'flat',
        enumdef: ['sphere', 'flat', 'none'],
      }),
      entry({
        key: 'end_captype',
        type: 'enum',
        value: 'flat',
        enumdef: ['sphere', 'flat', 'none'],
      }),
      entry({ key: 'segend_fade', type: 'boolean', value: false }),
      entry({ key: 'anchor_weight', type: 'real', value: 10 }),
    ]
  }

  it('renders the curated rows when present and omits absent ones', () => {
    const { container, unmount } = mountTree(
      <CartoonMainSection
        entries={mainEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Detail')).not.toBeNull()
    expect(rowByLabel(container, 'Smooth color')).not.toBeNull()
    expect(rowByLabel(container, 'Start cap')).not.toBeNull()
    expect(rowByLabel(container, 'End cap')).not.toBeNull()
    expect(rowByLabel(container, 'Segment-end fade')).not.toBeNull()
    expect(rowByLabel(container, 'Anchor weight')).not.toBeNull()
    unmount()
  })

  it('omits a row when its property is absent', () => {
    const { container, unmount } = mountTree(
      <CartoonMainSection
        entries={[entry({ key: 'smoothcolor', type: 'boolean', value: false })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Smooth color')).not.toBeNull()
    expect(rowByLabel(container, 'Detail')).toBeNull()
    unmount()
  })

  it('renders Detail as a stepper NumericField (no slider, no drag arrows)', () => {
    const { container, unmount } = mountTree(
      <CartoonMainSection
        entries={mainEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const detail = rowByLabel(container, 'Detail')!
    expect(detail.querySelector('.h3-form-numeric-row')).not.toBeNull()
    // No slider (slider={false}) and not the drag-numeric field.
    expect(detail.querySelector('.h3-form-slider')).toBeNull()
    expect(dragArrow(detail)).toBeNull()
    unmount()
  })

  it('commits Detail as a single-step integer on Enter', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <CartoonMainSection
        entries={mainEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const input = rowByLabel(container, 'Detail')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '12'))
    act(() =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    expect(onSet).toHaveBeenCalledWith('axialdetail', 'integer', 12)
    unmount()
  })

  it('commits a drag-numeric row as a plain single step (Anchor weight)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <CartoonMainSection
        entries={mainEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = dragArrow(rowByLabel(container, 'Anchor weight')!)!
    act(() => incr.click())
    // step 0.5 from 10 -> 10.5, committed as a plain single step (no realtime opts).
    expect(onSet).toHaveBeenCalledWith('anchor_weight', 'real', 10.5)
    unmount()
  })
})

describe('CartoonHelixSection width-mode gating', () => {
  function helixEntries(mode: string): GenericPropEntry[] {
    return [
      entry({ key: 'helix_ribbon', type: 'boolean', value: false }),
      entry({
        key: 'helix_width_mode',
        type: 'enum',
        value: mode,
        enumdef: ['const', 'average', 'wavy'],
      }),
      entry({ key: 'helix_width', type: 'real', value: 2.3 }),
      entry({ key: 'helix_wplus', type: 'real', value: 0.2 }),
      // Keep numeric values below their max so the increment arrow's
      // disabled state reflects only the width-mode gating, not a max-bound clamp.
      entry({ key: 'helix_wsmooth', type: 'real', value: 2 }),
      entry({ key: 'helix_smooth', type: 'real', value: 3 }),
      entry({ key: 'helix_extend', type: 'real', value: 0.5 }),
    ]
  }

  function render(mode: string) {
    return mountTree(
      <CartoonHelixSection
        entries={helixEntries(mode)}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
  }

  it('enables constant width and disables width-plus / width-smoothing in "const" mode', () => {
    const { container, unmount } = render('const')
    expect(dragArrow(rowByLabel(container, 'Width (const)')!)!.disabled).toBe(false)
    expect(dragArrow(rowByLabel(container, 'Width plus')!)!.disabled).toBe(true)
    expect(dragArrow(rowByLabel(container, 'Width smoothing')!)!.disabled).toBe(true)
    unmount()
  })

  it('disables constant width and width-smoothing but enables width-plus in "average" mode', () => {
    const { container, unmount } = render('average')
    expect(dragArrow(rowByLabel(container, 'Width (const)')!)!.disabled).toBe(true)
    expect(dragArrow(rowByLabel(container, 'Width plus')!)!.disabled).toBe(false)
    expect(dragArrow(rowByLabel(container, 'Width smoothing')!)!.disabled).toBe(true)
    unmount()
  })

  it('enables width-smoothing and width-plus in "wavy" mode', () => {
    const { container, unmount } = render('wavy')
    expect(dragArrow(rowByLabel(container, 'Width smoothing')!)!.disabled).toBe(false)
    expect(dragArrow(rowByLabel(container, 'Width plus')!)!.disabled).toBe(false)
    expect(dragArrow(rowByLabel(container, 'Width (const)')!)!.disabled).toBe(true)
    unmount()
  })
})

describe('CartoonSheetSection / CartoonCoilSection', () => {
  it('renders the sheet smoothing rows', () => {
    const { container, unmount } = mountTree(
      <CartoonSheetSection
        entries={[
          entry({ key: 'sheet_smooth', type: 'real', value: 2 }),
          entry({ key: 'sheet_wsmooth', type: 'real', value: 5 }),
        ]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Spline smoothing')).not.toBeNull()
    expect(rowByLabel(container, 'Width smoothing')).not.toBeNull()
    unmount()
  })

  it('renders the coil smoothing row', () => {
    const { container, unmount } = mountTree(
      <CartoonCoilSection
        entries={[entry({ key: 'coil_smooth', type: 'real', value: -1 })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Spline smoothing')).not.toBeNull()
    unmount()
  })
})

describe('PropertiesTab cartoon section dispatch', () => {
  const commonProps: Omit<
    React.ComponentProps<typeof PropertiesTab>,
    'rendererType' | 'entries'
  > = {
    onSet: vi.fn(),
    onReset: vi.fn(),
    sceneId: 1,
  }

  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  /** Full cartoon property list including a nested shape sub-object container. */
  function fullEntries(): GenericPropEntry[] {
    return [
      entry({ key: 'axialdetail', type: 'integer', value: 8 }),
      entry({ key: 'smoothcolor', type: 'boolean', value: false }),
      entry({
        key: 'helix_width_mode',
        type: 'enum',
        value: 'average',
        enumdef: ['const', 'average', 'wavy'],
      }),
      entry({ key: 'sheet_smooth', type: 'real', value: 2 }),
      entry({ key: 'coil_smooth', type: 'real', value: -1 }),
      // nested read-only shape sub-object -> must not be surfaced as a row
      entry({ key: 'helix', type: 'object<TubeSection>', value: '<node>', readonly: true, isContainer: true }),
    ]
  }

  it('shows the four cartoon sections (no placeholder)', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="cartoon" {...commonProps} />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Cartoon')
    expect(titles).toContain('Helix')
    expect(titles).toContain('Sheet')
    expect(titles).toContain('Coil')
    expect(titles).not.toContain('Renderer settings')
    unmount()
  })

  it('does not surface the nested shape sub-object as a curated row', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="cartoon" {...commonProps} />,
    )
    expect(rowByLabel(container, 'helix')).toBeNull()
    unmount()
  })
})
