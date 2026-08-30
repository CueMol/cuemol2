/**
 * NARenderer ("nucl") property-section wiring contract.
 *
 * Ports the UXP nucl-propdlg (Common / Nucleic acid / Tube tabs). The Tube tab
 * is the shared tube-page, so the tube renderer's Tube / Section / Putty
 * sections are reused, gated by the "Show tube" toggle. This test pins:
 *   - the registry resolves `type_name === "nucl"` to four sections
 *     (Nucleic acid / Tube / Section / Putty);
 *   - the base page renders the six base-rendering rows;
 *   - Base size and Base thick are one pair: the thickness is shown as a
 *     percentage of the size, and resizing rescales it so that percentage
 *     holds;
 *   - base_thick is shown as a percentage of base_size and committed back as an
 *     absolute value (pct * size / 100);
 *   - the "Show tube" gate disables the reused tube sections when off;
 *   - PropertiesTab shows the four nucl sections (no placeholder).
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree, pressStepArrow, openAccordion } from '@renderer/__test__/helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// The common page's Material row fetches names through useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

import { SchemaSection } from '@renderer/features/inspector/SchemaSection'
import { NUCL_SECTIONS } from '@renderer/features/inspector/schema/nucl'
import {
  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
} from '@renderer/features/inspector/rendererPropSections'
import { PropertiesTab } from '@renderer/features/inspector/PropertiesTab'


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

/** The six nucl-specific base-rendering properties. */
function baseEntries(over?: Partial<Record<string, unknown>>): GenericPropEntry[] {
  const v = (k: string, fallback: unknown) =>
    over && k in over ? over[k] : fallback
  return [
    entry({ key: 'show_tube', type: 'boolean', value: v('show_tube', true) as boolean }),
    entry({ key: 'show_basepair', type: 'boolean', value: true }),
    entry({
      key: 'base_type',
      type: 'enum',
      value: 'basepair',
      enumdef: ['basepair', 'simple1', 'detail1', 'detail2'],
    }),
    entry({ key: 'base_detail', type: 'integer', value: 3 }),
    entry({ key: 'base_size', type: 'real', value: v('base_size', 0.5) as number }),
    entry({ key: 'base_thick', type: 'real', value: v('base_thick', 0.5) as number }),
  ]
}

/** A representative subset of the inherited tube-page properties. */
function tubeEntries(): GenericPropEntry[] {
  return [
    entry({ key: 'axialdetail', type: 'integer', value: 8 }),
    entry({ key: 'smooth', type: 'real', value: 0.0 }),
    entry({ key: 'smoothcolor', type: 'boolean', value: true }),
    entry({ key: 'segend_fade', type: 'boolean', value: false }),
    entry({ key: 'pivotatom', type: 'string', value: '' }),
    entry({
      key: 'section.type',
      type: 'enum',
      value: 'elliptical',
      enumdef: ['elliptical', 'roundsquare', 'rectangle', 'fancy1'],
    }),
    entry({
      key: 'putty_mode',
      type: 'enum',
      value: 'none',
      enumdef: ['none', 'linear1', 'scale1'],
    }),
  ]
}

/** Find the property row (.h3-form-prop-row) whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

describe('NARenderer ("nucl") section registry', () => {
  it('resolves type_name "nucl" to four sections in UXP tab order', () => {
    const sections = getRendererPropSections('nucl')
    expect(sections.map((s) => s.title)).toEqual([
      'Nucleic acid',
      'Tube',
      'Section',
      'Putty',
    ])
    expect(sections).toBe(NUCL_SECTIONS)
    expect(RENDERER_SECTION_REGISTRY.nucl).toBe(sections)
  })
})

describe('the nucl base page', () => {
  it('renders the six base-rendering rows', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={NUCL_SECTIONS[0]}
        rendererType="nucl"
        entries={baseEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const labels = [
      'Show tube',
      'Connect base pair',
      'Base type',
      'Detail',
      'Base size',
      'Base thick',
    ]
    const present = labels.filter((l) => rowByLabel(container, l) !== null)
    expect(present).toEqual(labels)
    unmount()
  })

  it('shows base_thick as a percentage of base_size', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={NUCL_SECTIONS[0]}
        rendererType="nucl"
        entries={baseEntries({ base_size: 1.0, base_thick: 0.5 })}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const thickRow = rowByLabel(container, 'Base thick')!
    // 0.5 * 100 / 1.0 = 50.0 %
    expect(thickRow.querySelector('.h3-form-drag-value')!.textContent).toContain('50.0')
    expect(thickRow.querySelector('.h3-form-drag-unit')!.textContent).toBe('%')
    unmount()
  })

  it('rescales base_thick with base_size so its percentage stays put', () => {
    // base_thick is an absolute the row shows as a percentage of base_size, so
    // resizing the base without it would leave a thickness reading as more
    // than 100 % of a base it no longer fits.
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={NUCL_SECTIONS[0]}
        rendererType="nucl"
        entries={baseEntries({ base_size: 1.0, base_thick: 0.5 })}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Base size')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // 1.0 + step 0.1 -> 1.1, so the thickness scales 0.5 -> 0.55 and both
    // land in one undo step. 0.55 / 1.1 is still the 50 % it displayed.
    expect(onSetMany).toHaveBeenCalledTimes(1)
    const writes = onSetMany.mock.calls[0][0]
    expect(writes[0]).toMatchObject({ key: 'base_size', valueType: 'real' })
    expect(writes[0].value).toBeCloseTo(1.1, 5)
    expect(writes[1]).toMatchObject({ key: 'base_thick', valueType: 'real' })
    expect(writes[1].value).toBeCloseTo(0.55, 5)
    expect((writes[1].value * 100) / writes[0].value).toBeCloseTo(50, 5)
    unmount()
  })

  it('commits base_thick back as an absolute value (pct * size / 100)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={NUCL_SECTIONS[0]}
        rendererType="nucl"
        entries={baseEntries({ base_size: 1.0, base_thick: 0.5 })}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Base thick')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // 50 % + step 10 -> 60 %, written back as 60 * 1.0 / 100 = 0.6.
    expect(onSet).toHaveBeenCalledWith('base_thick', 'real', 0.6)
    unmount()
  })
})

describe('PropertiesTab nucl dispatch + Show tube gate', () => {
  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  const props = (showTube: boolean) => ({
    entries: [...baseEntries({ show_tube: showTube }), ...tubeEntries()],
    rendererType: 'nucl',
    onSet: vi.fn(),
    onReset: vi.fn(),
    sceneId: 1,
  })

  it('shows the four nucl sections (no placeholder)', () => {
    const { container, unmount } = mountTree(<PropertiesTab {...props(true)} />)
    const titles = accordionTitles(container)
    expect(titles).toEqual(
      expect.arrayContaining(['Nucleic acid', 'Tube', 'Section', 'Putty']),
    )
    expect(titles).not.toContain('Renderer settings')
    unmount()
  })

  it('enables the Tube section rows when Show tube is on', () => {
    const { container, unmount } = mountTree(<PropertiesTab {...props(true)} />)
    openAccordion(container, 'Tube')
    const drag = rowByLabel(container, 'Smoothness')!.querySelector('.h3-form-drag')
    expect(drag!.className).not.toContain('h3-form-drag-disabled')
    unmount()
  })

  it('disables the Tube section rows when Show tube is off', () => {
    const { container, unmount } = mountTree(<PropertiesTab {...props(false)} />)
    openAccordion(container, 'Tube')
    const drag = rowByLabel(container, 'Smoothness')!.querySelector('.h3-form-drag')
    expect(drag!.className).toContain('h3-form-drag-disabled')
    unmount()
  })
})
