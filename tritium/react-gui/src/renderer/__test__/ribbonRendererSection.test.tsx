/**
 * Ribbon (RibbonRenderer) property-section wiring contract.
 *
 * Pins the UXP-faithful migration of `ribbon-propdlg` (Common / Helix / Sheet /
 * Coil). Key pins:
 *   - the registry resolves `ribbon` to the four sections;
 *   - "Section detail" writes coil/helix/sheet .detail in one undo step, and
 *     "Cap type" writes start_captype + end_captype together;
 *   - section sharpness is gated on roundsquare/fancy1; the back/side colour
 *     picker is gated on its use checkbox; head/tail arrow params on the arrow
 *     type;
 *   - "Arrow height" shows the inverted basw percentage and commits it back;
 *   - the coil section omits the fancy1 type and has no head/tail/colour;
 *   - the non-UXP base `smooth` / `line_width` are not surfaced.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow, openAccordion } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// The common page's Material row fetches names through useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))
// Stub the colour field's picker (ThemeProvider / popover contexts) in unit tests.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
  CueColorField: ({ value, disabled }: any) => (
    <button data-disabled={String(!!disabled)}>{value}</button>
  ),
}))

import { SchemaSection } from '../components/inspector/SchemaSection'
import { RIBBON_SECTIONS } from '../components/inspector/schema/ribbon'
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

function changeSelect(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value',
  )!.set!
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

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

describe('Ribbon renderer section registry', () => {
  it('resolves type_name "ribbon" to Ribbon / Helix / Sheet / Coil sections', () => {
    const sections = getRendererPropSections('ribbon')
    expect(sections.map((s) => s.title)).toEqual(['Ribbon', 'Helix', 'Sheet', 'Coil'])
    expect(sections.every((s) => s.defaultExpanded)).toBe(true)
    expect(sections).toBe(RIBBON_SECTIONS)
    expect(RENDERER_SECTION_REGISTRY.ribbon).toBe(sections)
  })
})

describe('the ribbon main page', () => {
  function mainEntries(): GenericPropEntry[] {
    return [
      entry({ key: 'coil.detail', type: 'integer', value: 16 }),
      entry({ key: 'helix.detail', type: 'integer', value: 16 }),
      entry({ key: 'sheet.detail', type: 'integer', value: 16 }),
      entry({ key: 'axialdetail', type: 'integer', value: 8 }),
      entry({ key: 'smoothcolor', type: 'boolean', value: true }),
      entry({ key: 'pivotatom', type: 'string', value: '' }),
      entry({ key: 'start_captype', type: 'enum', value: 'flat', enumdef: ['sphere', 'flat', 'none'] }),
      entry({ key: 'end_captype', type: 'enum', value: 'flat', enumdef: ['sphere', 'flat', 'none'] }),
      entry({ key: 'segend_fade', type: 'boolean', value: false }),
    ]
  }

  it('renders the common rows with a "(default)" pivot placeholder', () => {
    const { container, unmount } = mountTree(
      <SchemaSection section={RIBBON_SECTIONS[0]} rendererType="ribbon" entries={mainEntries()} onSet={vi.fn()} onSetMany={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    for (const label of [
      'Section detail',
      'Axial detail',
      'Smooth color',
      'Pivot atom name',
      'Cap type',
      'Segment-end fade out',
    ]) {
      expect(rowByLabel(container, label), label).not.toBeNull()
    }
    expect(
      rowByLabel(container, 'Pivot atom name')!.querySelector('input')!.getAttribute('placeholder'),
    ).toBe('(default)')
    unmount()
  })

  it('writes coil/helix/sheet detail together when Section detail changes', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={RIBBON_SECTIONS[0]} rendererType="ribbon" entries={mainEntries()} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} />,
    )
    const input = rowByLabel(container, 'Section detail')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '10'))
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'coil.detail', valueType: 'integer', value: 10 },
      { key: 'helix.detail', valueType: 'integer', value: 10 },
      { key: 'sheet.detail', valueType: 'integer', value: 10 },
    ])
    unmount()
  })

  it('writes both start and end cap type from the single Cap type control', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={RIBBON_SECTIONS[0]} rendererType="ribbon" entries={mainEntries()} onSet={vi.fn()} onSetMany={onSetMany} onReset={vi.fn()} sceneId={1} />,
    )
    changeSelect(selectInRow(container, 'Cap type')!, 'sphere')
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'start_captype', valueType: 'enum', value: 'sphere' },
      { key: 'end_captype', valueType: 'enum', value: 'sphere' },
    ])
    unmount()
  })
})

describe('the ribbon helix page', () => {
  function helixEntries(opts: { sectType?: string; useBack?: boolean; headType?: string } = {}): GenericPropEntry[] {
    return [
      sectEntry('helix.type', opts.sectType ?? 'elliptical'),
      entry({ key: 'helix_usebackcol', type: 'boolean', value: opts.useBack ?? false }),
      entry({ key: 'helix_backcol', type: 'object<AbstractColor>', value: '#ffffff' }),
      entry({ key: 'helix.width', type: 'real', value: 0.2 }),
      entry({ key: 'helix.tuber', type: 'real', value: 6 }),
      entry({ key: 'helix.sharp', type: 'real', value: 0.4 }),
      entry({ key: 'helix_smooth', type: 'real', value: 0 }),
      jctTypeEntry('helixhead.type', opts.headType ?? 'arrow'),
      entry({ key: 'helixhead.gamma', type: 'real', value: 2.2 }),
      entry({ key: 'helixhead.basw', type: 'real', value: 0.5 }),
      entry({ key: 'helixhead.arrow', type: 'real', value: 1.8 }),
      jctTypeEntry('helixtail.type', 'smooth'),
      entry({ key: 'helixtail.gamma', type: 'real', value: 2.2 }),
      entry({ key: 'helixtail.basw', type: 'real', value: 0.5 }),
      entry({ key: 'helixtail.arrow', type: 'real', value: 1.8 }),
    ]
  }
  const render = (opts = {}) =>
    mountTree(
      <SchemaSection section={RIBBON_SECTIONS[1]} rendererType="ribbon" entries={helixEntries(opts)} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )

  it('renders the section, head and tail rows (and not the non-UXP base smooth/line width)', () => {
    const { container, unmount } = render()
    for (const label of [
      'Section type',
      'Use back color',
      'Back color',
      'Width',
      'Tuber',
      'Sharpness',
      'Smoothness',
      'Head type',
      'Head arrow height',
      'Tail type',
    ]) {
      expect(rowByLabel(container, label), label).not.toBeNull()
    }
    expect(rowByLabel(container, 'Line width')).toBeNull()
    unmount()
  })

  it('gates the colour picker on the use checkbox', () => {
    const off = render({ useBack: false })
    expect(rowByLabel(off.container, 'Back color')!.querySelector('button')!.getAttribute('data-disabled')).toBe('true')
    off.unmount()
    const on = render({ useBack: true })
    expect(rowByLabel(on.container, 'Back color')!.querySelector('button')!.getAttribute('data-disabled')).toBe('false')
    on.unmount()
  })

  it('enables Sharpness only for roundsquare / fancy1', () => {
    const ell = render({ sectType: 'elliptical' })
    expect(dragArrow(rowByLabel(ell.container, 'Sharpness')!)!.disabled).toBe(true)
    ell.unmount()
    const fancy = render({ sectType: 'fancy1' })
    expect(dragArrow(rowByLabel(fancy.container, 'Sharpness')!)!.disabled).toBe(false)
    fancy.unmount()
  })

  it('shows the inverted basw percentage for Head arrow height and commits it back', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection section={RIBBON_SECTIONS[1]} rendererType="ribbon" entries={helixEntries({ headType: 'arrow' })} onSet={onSet} onReset={vi.fn()} sceneId={1} />,
    )
    const row = rowByLabel(container, 'Head arrow height')!
    // basw 0.5 -> (1 - 0.5) * 100 = 50 %
    expect(row.querySelector('.h3-form-drag-value')!.textContent).toContain('50')
    pressStepArrow(dragArrow(row)!)
    // 50 + 10 = 60 % -> basw = (100 - 60) / 100 = 0.4
    expect(onSet).toHaveBeenCalledWith('helixhead.basw', 'real', 0.4)
    unmount()
  })

  it('disables head arrow params unless the head type is "arrow"', () => {
    const { container, unmount } = render({ headType: 'smooth' })
    expect(dragArrow(rowByLabel(container, 'Head arrow height')!)!.disabled).toBe(true)
    expect(dragArrow(rowByLabel(container, 'Head arrow width')!)!.disabled).toBe(true)
    unmount()
  })
})

describe('the ribbon coil page', () => {
  it('omits fancy1, colour and head/tail', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={RIBBON_SECTIONS[3]}
        rendererType="ribbon"
        entries={[
          entry({ key: 'coil.type', type: 'enum', value: 'elliptical', enumdef: ['elliptical', 'roundsquare', 'rectangle', 'fancy1'] }),
          entry({ key: 'coil.width', type: 'real', value: 0.25 }),
          entry({ key: 'coil.tuber', type: 'real', value: 1 }),
          entry({ key: 'coil.sharp', type: 'real', value: 0.4 }),
          entry({ key: 'coil_smooth', type: 'real', value: 0 }),
        ]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const opts = Array.from(selectInRow(container, 'Section type')!.options).map((o) => o.value)
    expect(opts).toEqual(['elliptical', 'roundsquare', 'rectangle'])
    expect(rowByLabel(container, 'Use back color')).toBeNull()
    expect(rowByLabel(container, 'Head type')).toBeNull()
    expect(rowByLabel(container, 'Smoothness')).not.toBeNull()
    unmount()
  })
})

describe('PropertiesTab ribbon dispatch', () => {
  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  it('shows the four ribbon sections (no placeholder) and opens one to see its rows', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[
          entry({ key: 'axialdetail', type: 'integer', value: 8 }),
          entry({ key: 'coil.type', type: 'enum', value: 'elliptical', enumdef: ['elliptical', 'roundsquare', 'rectangle'] }),
          entry({ key: 'coil.width', type: 'real', value: 0.25 }),
        ]}
        rendererType="ribbon"
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const titles = accordionTitles(container)
    expect(titles).toEqual(expect.arrayContaining(['Ribbon', 'Helix', 'Sheet', 'Coil']))
    expect(titles).not.toContain('Renderer settings')
    openAccordion(container, 'Coil')
    expect(rowByLabel(container, 'Width')).not.toBeNull()
    unmount()
  })
})
