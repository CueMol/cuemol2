/**
 * TraceRenderer property-section wiring contract.
 *
 * In UXP the trace renderer has no dedicated dialog: it shares simple-propdlg
 * with the simple renderer (line width only), so the inspector reuses
 * SimpleRendererSection under the "trace" registry key. This test pins:
 *   - the registry resolves `type_name === "trace"` to a single expanded
 *     "Trace" section backed by SimpleRendererSection;
 *   - PropertiesTab shows that "Trace" section (no placeholder) for the trace
 *     renderer, with the "Line width" drag-numeric row in the DOM;
 *   - committing the row emits a realtime single-step
 *     onSet('width','real',v,{mode:'commit',originalValue}).
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree, pressStepArrow } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('../hooks/useCueMol', () => ({
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

/** Accordion section header titles, in order. */
function accordionTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
    (t) => t.textContent ?? '',
  )
}

describe('TraceRenderer section registry', () => {
  it('resolves type_name "trace" to a single expanded "Trace" section reusing SimpleRendererSection', () => {
    const sections = getRendererPropSections('trace')
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Trace')
    expect(sections[0].defaultExpanded).toBe(true)
    expect(sections[0].Component).toBe(SimpleRendererSection)
    expect(RENDERER_SECTION_REGISTRY.trace).toBe(sections)
  })
})

describe('PropertiesTab trace dispatch', () => {
  const commonProps = {
    onSet: vi.fn(),
    onReset: vi.fn(),
    sceneId: 1,
  }

  it('shows the Trace section (no placeholder) with the Line width row', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[entry({ key: 'width', type: 'real', value: 1.2 })]}
        rendererType="trace"
        {...commonProps}
      />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Trace')
    expect(titles).not.toContain('Renderer settings')
    expect(rowByLabel(container, 'Line width')).not.toBeNull()
    unmount()
  })

  it('commits a realtime single-step change of width on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[entry({ key: 'width', type: 'real', value: 1.2 })]}
        rendererType="trace"
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
