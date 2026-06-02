/**
 * CPKRenderer property-section wiring contract.
 *
 * Pins the observable behaviour of the `cpk` renderer's inspector page migrated
 * from the UXP `cpk-propdlg` "Atom radii" tab:
 *   - the registry resolves `type_name === "cpk"` to a single "Atom radii"
 *     section;
 *   - the section renders a per-element radius row (Carbon..Others) plus Detail
 *     only when that property exists;
 *   - the radius rows carry the Angstrom unit and `detail` shows as an integer
 *     (no fractional digit) with no unit;
 *   - committing a numeric row emits a realtime single-step `onSet`;
 *   - PropertiesTab shows the section (no "Renderer settings" placeholder) for
 *     `cpk`.
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

import { CPKRendererSection } from '../components/inspector/CPKRendererSection'
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
  it('resolves type_name "cpk" to a single expanded "Atom radii" section', () => {
    const sections = getRendererPropSections('cpk')
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Atom radii')
    expect(sections[0].defaultExpanded).toBe(true)
    expect(sections[0].Component).toBe(CPKRendererSection)
    expect(RENDERER_SECTION_REGISTRY.cpk).toBe(sections)
  })
})

describe('CPKRendererSection', () => {
  it('renders one row per existing property', () => {
    const { container, unmount } = mountTree(
      <CPKRendererSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    for (const label of [...RADII_LABELS, 'Detail']) {
      expect(rowByLabel(container, label)).not.toBeNull()
    }
    unmount()
  })

  it('omits a row when its property is absent', () => {
    const { container, unmount } = mountTree(
      <CPKRendererSection
        entries={[entry({ key: 'vdwr_C', type: 'real', value: 1.7 })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Carbon')).not.toBeNull()
    expect(rowByLabel(container, 'Nitrogen')).toBeNull()
    expect(rowByLabel(container, 'Detail')).toBeNull()
    unmount()
  })

  it('shows detail as an integer and radii rows with the Angstrom unit', () => {
    const { container, unmount } = mountTree(
      <CPKRendererSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    // detail = 3 -> integer display (decimals 0), no unit.
    const detail = rowByLabel(container, 'Detail')!
    expect(detail.querySelector('.h3-form-drag-value')!.textContent).toContain('3')
    expect(detail.querySelector('.h3-form-drag-value')!.textContent).not.toContain('.')
    expect(detail.querySelector('.h3-form-drag-unit')).toBeNull()
    // every radius row carries the Angstrom unit.
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
      <CPKRendererSection
        entries={fullEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Carbon')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    act(() => incr.click())
    // step 0.01 from 1.7 -> 1.71, committed live (preview restored to original first).
    expect(onSet).toHaveBeenCalledWith('vdwr_C', 'real', 1.71, {
      mode: 'commit',
      originalValue: 1.7,
    })
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

  it('shows the Atom radii section (no placeholder) for the cpk renderer', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="cpk" {...commonProps} />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Atom radii')
    expect(titles).not.toContain('Renderer settings')
    expect(rowByLabel(container, 'Carbon')).not.toBeNull()
    unmount()
  })
})
