/**
 * Cartoon (Ribbon2Renderer) property-section wiring contract.
 *
 * Pins the UXP-faithful migration of the `cartoon-propdlg` tabs (Cartoon / Helix
 * / Sheet / Coil), including the nested section-shape (TubeSection) and head
 * junction (JctTable) controls reached by dotted keys. Key pins:
 *   - the registry resolves `cartoon` to the four sections (default-expanded);
 *   - the Cartoon tab exposes pivot atom + spline anchor and NO longer the
 *     non-UXP `segend_fade`; the Helix tab no longer exposes the non-UXP
 *     `helix_width` ("Width (const)");
 *   - the Helix tab is a Cylinder/Ribbon deck switched by `helix_ribbon`;
 *   - section sharpness is gated on the "roundsquare" type; the cylinder helix /
 *     sheet / coil section type omits "fancy1";
 *   - the ribbon head/tail writes both `ribhelix_head.*` and `ribhelix_tail.*`
 *     in one undo step; the sheet head writes the single `sheethead.*`;
 *   - "Arrow height" shows the inverted basw percentage and commits it back.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('../hooks/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

// Stub MolSelList (used by the anchor SelRow) to avoid the real picker's
// ThemeProvider / popover contexts in these unit tests.
vi.mock('../h3-kit/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel, onCommit, disabled }: any) => (
    <button data-disabled={String(!!disabled)} onClick={() => onCommit?.('newsel')}>
      {selectedSel}
    </button>
  ),
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

/** Change a controlled <select> so React's value tracker fires onChange. */
function changeSelect(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  )!.set!
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

/** The right step arrow of a drag-numeric row (present only for DragNumericField). */
function dragArrow(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector('.h3-form-drag-arrow-right') as HTMLButtonElement | null
}

function selectInRow(container: HTMLElement, label: string): HTMLSelectElement | null {
  return rowByLabel(container, label)?.querySelector('select') ?? null
}

const sectEntry = (key: string, value: string) =>
  entry({
    key,
    type: 'enum',
    value,
    enumdef: ['elliptical', 'roundsquare', 'rectangle', 'fancy1'],
  })
const jctTypeEntry = (key: string, value: string) =>
  entry({ key, type: 'enum', value, enumdef: ['smooth', 'arrow', 'flat'] })

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
  function mainEntries(anchorSelValue = ''): GenericPropEntry[] {
    return [
      entry({ key: 'axialdetail', type: 'integer', value: 8 }),
      entry({ key: 'smoothcolor', type: 'boolean', value: false }),
      entry({ key: 'pivotatom', type: 'string', value: '' }),
      entry({ key: 'start_captype', type: 'enum', value: 'flat', enumdef: ['sphere', 'flat', 'none'] }),
      entry({ key: 'end_captype', type: 'enum', value: 'flat', enumdef: ['sphere', 'flat', 'none'] }),
      entry({ key: 'anchor_sel', type: 'object<MolSelection>', value: anchorSelValue }),
      entry({ key: 'anchor_weight', type: 'real', value: 10 }),
    ]
  }

  it('renders the UXP rows (incl pivot atom + anchor) and omits the non-UXP segend_fade', () => {
    const { container, unmount } = mountTree(
      <CartoonMainSection entries={mainEntries()} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    for (const label of [
      'Axial detail',
      'Smooth color',
      'Pivot atom name',
      'Start cap',
      'End cap',
      'Anchor selection',
      'Anchor weight',
    ]) {
      expect(rowByLabel(container, label), label).not.toBeNull()
    }
    // segend_fade is not part of the UXP cartoon dialog.
    expect(rowByLabel(container, 'Segment-end fade')).toBeNull()
    expect(rowByLabel(container, 'Segment-end fade out')).toBeNull()
    unmount()
  })

  it('shows a "(default)" placeholder on the empty pivot atom field', () => {
    const { container, unmount } = mountTree(
      <CartoonMainSection entries={mainEntries()} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    const input = rowByLabel(container, 'Pivot atom name')!.querySelector('input')
    expect(input?.getAttribute('placeholder')).toBe('(default)')
    unmount()
  })

  it('renders Axial detail as a stepper NumericField and commits a single step', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <CartoonMainSection entries={mainEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} />,
    )
    const detail = rowByLabel(container, 'Axial detail')!
    expect(dragArrow(detail)).toBeNull()
    const input = detail.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '12'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSet).toHaveBeenCalledWith('axialdetail', 'integer', 12)
    unmount()
  })

  it('disables the anchor weight when no anchor selection is set, enables it otherwise', () => {
    const off = mountTree(
      <CartoonMainSection entries={mainEntries('')} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(dragArrow(rowByLabel(off.container, 'Anchor weight')!)!.disabled).toBe(true)
    off.unmount()

    const on = mountTree(
      <CartoonMainSection entries={mainEntries('A.*')} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(dragArrow(rowByLabel(on.container, 'Anchor weight')!)!.disabled).toBe(false)
    on.unmount()
  })
})

describe('CartoonHelixSection (cylinder deck)', () => {
  function cylEntries(opts: { mode?: string; sectType?: string } = {}): GenericPropEntry[] {
    return [
      entry({ key: 'helix_ribbon', type: 'boolean', value: false }),
      entry({ key: 'helix_smooth', type: 'real', value: 3 }),
      entry({ key: 'helix_extend', type: 'real', value: 0.5 }),
      sectEntry('helix.type', opts.sectType ?? 'elliptical'),
      entry({ key: 'helix.detail', type: 'integer', value: 16 }),
      entry({ key: 'helix.tuber', type: 'real', value: 1 }),
      entry({ key: 'helix.sharp', type: 'real', value: 0.4 }),
      entry({
        key: 'helix_width_mode',
        type: 'enum',
        value: opts.mode ?? 'average',
        enumdef: ['const', 'average', 'wavy'],
      }),
      entry({ key: 'helix_wplus', type: 'real', value: 0.2 }),
      entry({ key: 'helix_wsmooth', type: 'real', value: 2 }),
    ]
  }
  const render = (opts = {}) =>
    mountTree(
      <CartoonHelixSection entries={cylEntries(opts)} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )

  it('shows cylinder rows and NOT the non-UXP "Width (const)"', () => {
    const { container, unmount } = render()
    expect(rowByLabel(container, 'Smoothing')).not.toBeNull()
    expect(rowByLabel(container, 'Extend')).not.toBeNull()
    expect(rowByLabel(container, 'Section type')).not.toBeNull()
    expect(rowByLabel(container, 'Width mode')).not.toBeNull()
    expect(rowByLabel(container, 'Add width')).not.toBeNull()
    expect(rowByLabel(container, 'Width smooth')).not.toBeNull()
    // non-UXP extra removed
    expect(rowByLabel(container, 'Width (const)')).toBeNull()
    unmount()
  })

  it('omits "fancy1" from the cylinder section type options', () => {
    const { container, unmount } = render()
    const opts = Array.from(selectInRow(container, 'Section type')!.options).map((o) => o.value)
    expect(opts).toEqual(['elliptical', 'roundsquare', 'rectangle'])
    unmount()
  })

  it('does not gate Add width, gates Width smooth to "wavy" only', () => {
    const avg = render({ mode: 'average' })
    expect(dragArrow(rowByLabel(avg.container, 'Add width')!)!.disabled).toBe(false)
    expect(dragArrow(rowByLabel(avg.container, 'Width smooth')!)!.disabled).toBe(true)
    avg.unmount()

    const wavy = render({ mode: 'wavy' })
    expect(dragArrow(rowByLabel(wavy.container, 'Width smooth')!)!.disabled).toBe(false)
    wavy.unmount()
  })

  it('enables Sharpness only for the "roundsquare" section type', () => {
    const ell = render({ sectType: 'elliptical' })
    expect(dragArrow(rowByLabel(ell.container, 'Sharpness')!)!.disabled).toBe(true)
    ell.unmount()

    const rs = render({ sectType: 'roundsquare' })
    expect(dragArrow(rowByLabel(rs.container, 'Sharpness')!)!.disabled).toBe(false)
    rs.unmount()
  })
})

describe('CartoonHelixSection (ribbon deck)', () => {
  function ribEntries(headType = 'arrow'): GenericPropEntry[] {
    return [
      entry({ key: 'helix_ribbon', type: 'boolean', value: true }),
      sectEntry('ribhelix.type', 'elliptical'),
      entry({ key: 'ribhelix.detail', type: 'integer', value: 8 }),
      entry({ key: 'ribhelix.width', type: 'real', value: 1.2 }),
      entry({ key: 'ribhelix.tuber', type: 'real', value: 1 }),
      entry({ key: 'ribhelix.sharp', type: 'real', value: 0.4 }),
      jctTypeEntry('ribhelix_head.type', headType),
      entry({ key: 'ribhelix_head.gamma', type: 'real', value: 2.2 }),
      entry({ key: 'ribhelix_head.basw', type: 'real', value: 0.5 }),
      entry({ key: 'ribhelix_head.arrow', type: 'real', value: 1.8 }),
      jctTypeEntry('ribhelix_tail.type', headType),
      entry({ key: 'ribhelix_tail.gamma', type: 'real', value: 2.2 }),
      entry({ key: 'ribhelix_tail.basw', type: 'real', value: 0.5 }),
      entry({ key: 'ribhelix_tail.arrow', type: 'real', value: 1.8 }),
    ]
  }

  it('shows ribbon section + head/tail rows and hides the cylinder-only rows', () => {
    const { container, unmount } = mountTree(
      <CartoonHelixSection entries={ribEntries()} onSet={vi.fn()} onSetMany={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(rowByLabel(container, 'Section type')).not.toBeNull()
    expect(rowByLabel(container, 'Section width')).not.toBeNull()
    expect(rowByLabel(container, 'Cap type')).not.toBeNull()
    expect(rowByLabel(container, 'Arrow height')).not.toBeNull()
    // cylinder-only rows are not shown in ribbon mode
    expect(rowByLabel(container, 'Width mode')).toBeNull()
    expect(rowByLabel(container, 'Smoothing')).toBeNull()
    unmount()
  })

  it('writes both head and tail in one undo step when the cap type changes', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <CartoonHelixSection entries={ribEntries()} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} />,
    )
    changeSelect(selectInRow(container, 'Cap type')!, 'flat')
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'ribhelix_head.type', valueType: 'enum', value: 'flat' },
      { key: 'ribhelix_tail.type', valueType: 'enum', value: 'flat' },
    ])
    unmount()
  })

  it('shows the inverted basw percentage for Arrow height and commits it back (both head+tail)', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <CartoonHelixSection entries={ribEntries('arrow')} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} />,
    )
    const row = rowByLabel(container, 'Arrow height')!
    // basw 0.5 -> (1 - 0.5) * 100 = 50 %
    expect(row.querySelector('.h3-form-drag-value')!.textContent).toContain('50')
    pressStepArrow(dragArrow(row)!)
    // 50 + 10 = 60 % -> basw = (100 - 60) / 100 = 0.4 for both head and tail
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'ribhelix_head.basw', valueType: 'real', value: 0.4 },
      { key: 'ribhelix_tail.basw', valueType: 'real', value: 0.4 },
    ])
    unmount()
  })

  it('disables Arrow height/width unless the cap type is "arrow"', () => {
    const { container, unmount } = mountTree(
      <CartoonHelixSection entries={ribEntries('smooth')} onSet={vi.fn()} onSetMany={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(dragArrow(rowByLabel(container, 'Arrow height')!)!.disabled).toBe(true)
    expect(dragArrow(rowByLabel(container, 'Arrow width')!)!.disabled).toBe(true)
    unmount()
  })
})

describe('CartoonSheetSection', () => {
  function sheetEntries(): GenericPropEntry[] {
    return [
      entry({ key: 'sheet_smooth', type: 'real', value: 2 }),
      sectEntry('sheet.type', 'elliptical'),
      entry({ key: 'sheet.detail', type: 'integer', value: 8 }),
      entry({ key: 'sheet.tuber', type: 'real', value: 1 }),
      entry({ key: 'sheet.sharp', type: 'real', value: 0.4 }),
      entry({ key: 'sheet.width', type: 'real', value: 1.2 }),
      entry({ key: 'sheet_wsmooth', type: 'real', value: 5 }),
      jctTypeEntry('sheethead.type', 'arrow'),
      entry({ key: 'sheethead.gamma', type: 'real', value: 2.2 }),
      entry({ key: 'sheethead.basw', type: 'real', value: 0.5 }),
      entry({ key: 'sheethead.arrow', type: 'real', value: 1.8 }),
    ]
  }

  it('renders the spline, section, width-smooth and head rows', () => {
    const { container, unmount } = mountTree(
      <CartoonSheetSection entries={sheetEntries()} onSet={vi.fn()} onSetMany={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    for (const label of [
      'Smoothing',
      'Section type',
      'Section detail',
      'Section width',
      'Width smooth',
      'Cap type',
      'Arrow height',
    ]) {
      expect(rowByLabel(container, label), label).not.toBeNull()
    }
    unmount()
  })

  it('commits the single sheethead.basw via onSet (not onSetMany)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <CartoonSheetSection entries={sheetEntries()} onSet={onSet} onSetMany={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    pressStepArrow(dragArrow(rowByLabel(container, 'Arrow height')!)!)
    // 50 % + 10 -> 60 % -> basw 0.4
    expect(onSet).toHaveBeenCalledWith('sheethead.basw', 'real', 0.4)
    unmount()
  })
})

describe('CartoonCoilSection', () => {
  it('renders the coil spline + section rows (no head, no width-smooth)', () => {
    const { container, unmount } = mountTree(
      <CartoonCoilSection
        entries={[
          entry({ key: 'coil_smooth', type: 'real', value: -1 }),
          sectEntry('coil.type', 'elliptical'),
          entry({ key: 'coil.detail', type: 'integer', value: 8 }),
          entry({ key: 'coil.tuber', type: 'real', value: 1 }),
          entry({ key: 'coil.sharp', type: 'real', value: 0.4 }),
          entry({ key: 'coil.width', type: 'real', value: 1.2 }),
        ]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Smoothing')).not.toBeNull()
    expect(rowByLabel(container, 'Section type')).not.toBeNull()
    expect(rowByLabel(container, 'Section width')).not.toBeNull()
    expect(rowByLabel(container, 'Cap type')).toBeNull()
    expect(rowByLabel(container, 'Width smooth')).toBeNull()
    unmount()
  })
})

describe('PropertiesTab cartoon section dispatch', () => {
  const commonProps = { onSet: vi.fn(), onReset: vi.fn(), sceneId: 1 }

  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  function fullEntries(): GenericPropEntry[] {
    return [
      entry({ key: 'axialdetail', type: 'integer', value: 8 }),
      entry({ key: 'helix_ribbon', type: 'boolean', value: false }),
      entry({ key: 'sheet_smooth', type: 'real', value: 2 }),
      entry({ key: 'coil_smooth', type: 'real', value: -1 }),
      // nested read-only container -> must not be surfaced as a bare row
      entry({ key: 'helix', type: 'object<TubeSection>', value: '<node>', readonly: true, isContainer: true }),
    ]
  }

  it('shows the four cartoon sections (no placeholder)', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="cartoon" {...commonProps} />,
    )
    const titles = accordionTitles(container)
    expect(titles).toEqual(expect.arrayContaining(['Cartoon', 'Helix', 'Sheet', 'Coil']))
    expect(titles).not.toContain('Renderer settings')
    unmount()
  })

  it('does not surface the nested container object as a bare row', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="cartoon" {...commonProps} />,
    )
    expect(rowByLabel(container, 'helix')).toBeNull()
    unmount()
  })
})
