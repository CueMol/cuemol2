/**
 * SplineRenderer property-section wiring contract.
 *
 * The spline renderer has no dedicated UXP dialog; its inspector page is curated
 * from the C++ SplineRenderer.qif as a single "Spline" section. This test pins:
 *   - the registry resolves `type_name === "spline"` to a single expanded
 *     "Spline" section backed by SplineMainSection;
 *   - all six migrated rows render when their property exists (axial detail /
 *     smoothness / smooth color / line width / segment-end fade / pivot atom);
 *   - the tube cap-type props are NOT exposed even when present (caps are
 *     non-functional on spline's line geometry);
 *   - the realtime drag rows (line width, smoothness) commit a single-step
 *     onSet(..., {mode:'commit', originalValue}) on the step arrow;
 *   - PropertiesTab shows the Spline section (no placeholder) for the spline
 *     renderer.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree, pressStepArrow, openAccordion } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// The common page's Material row fetches names through useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

import { SchemaSection } from '../components/inspector/SchemaSection'
import { SPLINE_SECTIONS } from '../components/inspector/schema/spline'
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

/** All spline type-specific properties with their C++ defaults. */
function splineEntries(): GenericPropEntry[] {
  return [
    entry({ key: 'axialdetail', type: 'integer', value: 6 }),
    entry({ key: 'smooth', type: 'real', value: 0.0 }),
    entry({ key: 'smoothcolor', type: 'boolean', value: true }),
    entry({ key: 'line_width', type: 'real', value: 1.2 }),
    entry({ key: 'segend_fade', type: 'boolean', value: false }),
    entry({ key: 'pivotatom', type: 'string', value: '' }),
  ]
}

/** Find the property row (.h3-form-prop-row) whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

describe('SplineRenderer section registry', () => {
  it('resolves type_name "spline" to a single expanded "Spline" section', () => {
    const sections = getRendererPropSections('spline')
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Spline')
    expect(sections[0].defaultExpanded).toBe(true)
    expect(RENDERER_SECTION_REGISTRY.spline).toBe(sections)
  })
})

describe('the spline page', () => {
  it('renders every migrated row when its property exists', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={SPLINE_SECTIONS[0]}
        entries={splineEntries()}
        rendererType="spline"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const labels = [
      'Axial detail',
      'Smoothness',
      'Smooth color',
      'Line width',
      'Segment-end fade out',
      'Pivot atom name',
    ]
    const present = labels.filter((l) => rowByLabel(container, l) !== null)
    expect(present).toEqual(labels)
    unmount()
  })

  it('shows a "(default)" placeholder on the empty pivot atom name field', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={SPLINE_SECTIONS[0]}
        entries={splineEntries()}
        rendererType="spline"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const input = rowByLabel(container, 'Pivot atom name')!.querySelector('input')
    expect(input?.getAttribute('placeholder')).toBe('(default)')
    unmount()
  })

  it('does not expose the tube cap-type properties even when present', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={SPLINE_SECTIONS[0]}
        entries={[
          ...splineEntries(),
          entry({
            key: 'start_captype',
            type: 'enum',
            value: 'sphere',
            enumdef: ['sphere', 'flat', 'none'],
          }),
          entry({
            key: 'end_captype',
            type: 'enum',
            value: 'sphere',
            enumdef: ['sphere', 'flat', 'none'],
          }),
        ]}
        rendererType="spline"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(rowByLabel(container, 'Start cap')).toBeNull()
    expect(rowByLabel(container, 'End cap')).toBeNull()
    unmount()
  })

  it('renders nothing for an absent property', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={SPLINE_SECTIONS[0]}
        entries={[entry({ key: 'smoothcolor', type: 'boolean', value: true })]}
        rendererType="spline"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(rowByLabel(container, 'Line width')).toBeNull()
    expect(rowByLabel(container, 'Smoothness')).toBeNull()
    expect(rowByLabel(container, 'Smooth color')).not.toBeNull()
    unmount()
  })

  it('commits a realtime single-step change of line width on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={SPLINE_SECTIONS[0]}
        entries={splineEntries()}
        rendererType="spline"
        sceneId={1}
        nodeId={100}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const incr = rowByLabel(container, 'Line width')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // step 0.2 from 1.2 -> 1.4, committed live (preview restored to original first).
    expect(onSet).toHaveBeenCalledWith('line_width', 'real', 1.4, {
      mode: 'commit',
      originalValue: 1.2,
      originalWasDefault: false,
    })
    unmount()
  })

  it('commits a realtime single-step change of smoothness on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={SPLINE_SECTIONS[0]}
        entries={splineEntries()}
        rendererType="spline"
        sceneId={1}
        nodeId={100}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const incr = rowByLabel(container, 'Smoothness')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // step 0.01 from 0.0 -> 0.01, committed live.
    expect(onSet).toHaveBeenCalledWith('smooth', 'real', 0.01, {
      mode: 'commit',
      originalValue: 0,
      originalWasDefault: false,
    })
    unmount()
  })
})

describe('PropertiesTab spline dispatch', () => {
  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  it('shows the Spline section (no placeholder) with the Line width row', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={splineEntries()}
        rendererType="spline"
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Spline')
    expect(titles).not.toContain('Renderer settings')
    openAccordion(container, 'Spline')
    expect(rowByLabel(container, 'Line width')).not.toBeNull()
    unmount()
  })
})
