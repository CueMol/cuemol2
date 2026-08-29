/**
 * CPKRenderer property-section wiring contract.
 *
 * Pins the observable behaviour of the `cpk` renderer's inspector page migrated
 * from the UXP `cpk-propdlg` "Atom radii" tab:
 *   - the registry resolves `type_name === "cpk"` to two sections, "Atom radii"
 *     (the seven per-element radii groupbox) and "Detail" (the loose detail row
 *     that sits outside the groupbox in UXP);
 *   - each section renders a row only when its property exists;
 *   - the radius rows carry the Angstrom unit and `detail` shows as an integer
 *     (no fractional digit) with no unit;
 *   - committing a numeric row emits a realtime single-step `onSet`;
 *   - PropertiesTab shows both sections (no "Renderer settings" placeholder) for
 *     `cpk`, and `detail` is not rendered under the "Atom radii" section.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree, pressStepArrow, openAccordion } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

import {
  CPKAtomRadiiSection,
  CPKDetailSection,
} from '../components/inspector/CPKRendererSection'
import {
  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
  isComponentSection,
  type RendererPropSectionDef,
} from '../components/inspector/rendererPropSections'
import { PropertiesTab } from '../components/inspector/PropertiesTab'

/**
 * The component a registry entry renders. The registry holds either a
 * hand-written component or a schema (rows as data) while the per-type pages
 * are migrated, so a test that expects a component has to say which it is.
 */
function componentOf(section: RendererPropSectionDef): unknown {
  return isComponentSection(section) ? section.Component : `schema:${section.key}`
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

/** Find the property row (.h3-form-prop-row) whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

/** All eight CPK properties present (C++ defaults). */
function fullEntries(): GenericPropEntry[] {
  return [
    entry({ key: 'vdwr_C', type: 'real', value: 1.7 }),
    entry({ key: 'vdwr_N', type: 'real', value: 1.55 }),
    entry({ key: 'vdwr_O', type: 'real', value: 1.52 }),
    entry({ key: 'vdwr_S', type: 'real', value: 1.8 }),
    entry({ key: 'vdwr_P', type: 'real', value: 1.8 }),
    entry({ key: 'vdwr_H', type: 'real', value: 1.2 }),
    entry({ key: 'vdwr_X', type: 'real', value: 1.7 }),
    entry({ key: 'detail', type: 'integer', value: 3 }),
  ]
}

const RADII_LABELS = [
  'Carbon',
  'Nitrogen',
  'Oxygen',
  'Sulfur',
  'Phosphorus',
  'Hydrogen',
  'Others',
]

describe('CPKRenderer section registry', () => {
  it('resolves type_name "cpk" to "Atom radii" then "Detail" sections', () => {
    const sections = getRendererPropSections('cpk')
    expect(sections.map((s) => s.title)).toEqual(['Atom radii', 'Detail'])
    expect(sections.every((s) => s.defaultExpanded)).toBe(true)
    expect(componentOf(sections[0])).toBe(CPKAtomRadiiSection)
    expect(componentOf(sections[1])).toBe(CPKDetailSection)
    expect(RENDERER_SECTION_REGISTRY.cpk).toBe(sections)
  })
})

describe('CPKAtomRadiiSection', () => {
  it('renders one row per existing element radius and no detail row', () => {
    const { container, unmount } = mountTree(
      <CPKAtomRadiiSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    for (const label of RADII_LABELS) {
      expect(rowByLabel(container, label)).not.toBeNull()
    }
    // detail belongs to a separate section, never to the Atom radii group.
    expect(rowByLabel(container, 'Detail')).toBeNull()
    unmount()
  })

  it('omits a radius row when its property is absent', () => {
    const { container, unmount } = mountTree(
      <CPKAtomRadiiSection
        entries={[entry({ key: 'vdwr_C', type: 'real', value: 1.7 })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Carbon')).not.toBeNull()
    expect(rowByLabel(container, 'Nitrogen')).toBeNull()
    unmount()
  })

  it('renders radii rows with the Angstrom unit', () => {
    const { container, unmount } = mountTree(
      <CPKAtomRadiiSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    for (const label of RADII_LABELS) {
      expect(
        rowByLabel(container, label)!.querySelector('.h3-form-drag-unit')!.textContent,
      ).toBe('Å')
    }
    unmount()
  })

  it('commits a realtime single-step change of a radius on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <CPKAtomRadiiSection
        entries={fullEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Carbon')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // step 0.05 from 1.7 -> 1.75, committed live (preview restored to original first).
    expect(onSet).toHaveBeenCalledWith('vdwr_C', 'real', 1.75, {
      mode: 'commit',
      originalValue: 1.7,
      originalWasDefault: false,
    })
    unmount()
  })

  it('threads the pre-edit default flag into a realtime commit', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <CPKAtomRadiiSection
        entries={[
          entry({ key: 'vdwr_C', type: 'real', value: 1.7, hasdefault: true, isdefault: true }),
        ]}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Carbon')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // The prop was default before the edit; the commit carries that so undo
    // reverts the default state, not just the value.
    expect(onSet).toHaveBeenCalledWith('vdwr_C', 'real', 1.75, {
      mode: 'commit',
      originalValue: 1.7,
      originalWasDefault: true,
    })
    unmount()
  })
})

describe('CPKDetailSection', () => {
  it('shows detail as an integer with no unit', () => {
    const { container, unmount } = mountTree(
      <CPKDetailSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const detail = rowByLabel(container, 'Detail')!
    expect(detail.querySelector('.h3-form-drag-value')!.textContent).toContain('3')
    expect(detail.querySelector('.h3-form-drag-value')!.textContent).not.toContain('.')
    expect(detail.querySelector('.h3-form-drag-unit')).toBeNull()
    unmount()
  })

  it('renders nothing when detail is absent', () => {
    const { container, unmount } = mountTree(
      <CPKDetailSection
        entries={[entry({ key: 'vdwr_C', type: 'real', value: 1.7 })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Detail')).toBeNull()
    unmount()
  })
})

describe('PropertiesTab cpk section dispatch', () => {
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

  /** The accordion body element whose header title matches. */
  function sectionBody(container: HTMLElement, title: string): HTMLElement | null {
    const header = Array.from(
      container.querySelectorAll('.insp-accordion-title'),
    ).find((t) => t.textContent === title)
    return header
      ? (header.closest('.insp-accordion')!.querySelector(
          '.insp-accordion-body',
        ) as HTMLElement)
      : null
  }

  it('shows the Atom radii and Detail sections (no placeholder) for cpk', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="cpk" {...commonProps} />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Atom radii')
    expect(titles).toContain('Detail')
    expect(titles).not.toContain('Renderer settings')
    unmount()
  })

  it('renders detail in the Detail section, not under Atom radii', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="cpk" {...commonProps} />,
    )
    // Exclusive accordions: open each section in turn to inspect its body.
    openAccordion(container, 'Atom radii')
    const radiiBody = sectionBody(container, 'Atom radii')!
    expect(rowByLabel(radiiBody, 'Detail')).toBeNull()
    expect(rowByLabel(radiiBody, 'Carbon')).not.toBeNull()
    openAccordion(container, 'Detail')
    const detailBody = sectionBody(container, 'Detail')!
    expect(rowByLabel(detailBody, 'Detail')).not.toBeNull()
    unmount()
  })
})
