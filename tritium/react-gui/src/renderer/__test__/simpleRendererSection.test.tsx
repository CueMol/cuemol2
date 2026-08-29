/**
 * SimpleRenderer property-section wiring contract.
 *
 * Pins the observable behaviour of the `simple` renderer's inspector page
 * migrated from the UXP `simple-propdlg` "Simple" tab (line width only):
 *   - the registry resolves `type_name === "simple"` to a single "Simple"
 *     section (and unknown types to none);
 *   - the section renders a "Line width" drag-numeric row only when the
 *     `width` property exists;
 *   - committing the row emits a realtime `onSet('width', 'real', v, {mode:
 *     'commit', originalValue})` (a single undo step previewed live);
 *   - PropertiesTab shows the Simple section for `simple` and falls back to the
 *     "Not implemented" placeholder for not-yet-ported types.
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

import { SimpleRendererSection } from '../components/inspector/SimpleRendererSection'
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

describe('SimpleRenderer section registry', () => {
  it('resolves type_name "simple" to a single expanded "Simple" section', () => {
    const sections = getRendererPropSections('simple')
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Simple')
    expect(sections[0].defaultExpanded).toBe(true)
    expect(sections[0].Component).toBe(SimpleRendererSection)
    // Sanity: the registry is keyed by the C++ type_name.
    expect(RENDERER_SECTION_REGISTRY.simple).toBe(sections)
  })

  it('resolves an unknown / not-yet-ported renderer type to no sections', () => {
    expect(getRendererPropSections('no_such_renderer')).toEqual([])
  })
})

describe('SimpleRendererSection', () => {
  it('renders the Line width row when the width property exists', () => {
    const { container, unmount } = mountTree(
      <SimpleRendererSection
        entries={[entry({ key: 'width', type: 'real', value: 1.2 })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const row = rowByLabel(container, 'Line width')
    expect(row).not.toBeNull()
    // UXP px unit + step 0.2 -> 2-decimal display.
    expect(row!.querySelector('.h3-form-drag-value')!.textContent).toContain('1.20')
    expect(row!.querySelector('.h3-form-drag-unit')!.textContent).toBe('px')
    unmount()
  })

  it('renders nothing when the width property is absent', () => {
    const { container, unmount } = mountTree(
      <SimpleRendererSection
        entries={[entry({ key: 'valbond', type: 'boolean', value: true })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Line width')).toBeNull()
    unmount()
  })

  it('commits a realtime single-step change of width on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SimpleRendererSection
        entries={[entry({ key: 'width', type: 'real', value: 1.2 })]}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Line width')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // step 0.2 from 1.2 -> 1.4, committed live (preview restored to original first).
    expect(onSet).toHaveBeenCalledWith('width', 'real', 1.4, {
      mode: 'commit',
      originalValue: 1.2,
      originalWasDefault: false,
    })
    unmount()
  })
})

describe('PropertiesTab type-specific section dispatch', () => {
  const commonProps: Omit<
    React.ComponentProps<typeof PropertiesTab>,
    'rendererType' | 'entries'
  > = {
    onSet: vi.fn(),
    onReset: vi.fn(),
    sceneId: 1,
  }

  /** Accordion section header titles, in order. */
  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  it('shows the Simple section (no placeholder) for the simple renderer', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[entry({ key: 'width', type: 'real', value: 1.2 })]}
        rendererType="simple"
        {...commonProps}
      />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Simple')
    expect(titles).not.toContain('Renderer settings')
    // Accordions are an exclusive group; open the Simple section to see its row.
    openAccordion(container, 'Simple')
    expect(rowByLabel(container, 'Line width')).not.toBeNull()
    unmount()
  })

  it('falls back to the placeholder for a not-yet-ported renderer type', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[entry({ key: 'width', type: 'real', value: 1.2 })]}
        rendererType="no_such_renderer"
        {...commonProps}
      />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Renderer settings')
    expect(titles).not.toContain('Simple')
    expect(rowByLabel(container, 'Line width')).toBeNull()
    unmount()
  })
})
