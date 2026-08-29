/**
 * AnIsoURenderer property-section wiring contract.
 *
 * Pins the observable behaviour of the `anisou` renderer's inspector page. The
 * renderer extends `BallStickRenderer` and adds ORTEP-like disc controls; it has
 * no dedicated UXP property dialog, so the page is composed from two registry
 * sections:
 *   - the shared `BallStickRendererSection` for the inherited base controls;
 *   - `AnIsoUDiscSection` for the anisou-only disc controls (drawdisc /
 *     discscale / discthick).
 *
 * The pins:
 *   - the registry resolves `type_name === "anisou"` to "Atoms and bonds" then
 *     "Anisotropic displacement" sections, reusing the ball-and-stick component;
 *   - each disc row renders only when its property exists;
 *   - disc scale / thickness are disabled while `drawdisc` is off;
 *   - committing a disc numeric row emits a plain single-step `onSet` (no
 *     realtime preview opts);
 *   - PropertiesTab shows both sections (no "Renderer settings" placeholder) for
 *     `anisou`, and the internal `maxverts` cap is not surfaced as a row.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree, pressStepArrow, openAccordion } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

import { AnIsoUDiscSection } from '../components/inspector/AnIsoURendererSection'
import { BallStickRendererSection } from '../components/inspector/BallStickRendererSection'
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

/** Find the property row whose label text matches. */
function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

/** Full anisou property list (C++ defaults): base ball-and-stick + disc + cap. */
function fullEntries(): GenericPropEntry[] {
  return [
    // inherited ball-and-stick base
    entry({ key: 'detail', type: 'integer', value: 3 }),
    entry({ key: 'bondw', type: 'real', value: 0.2 }),
    entry({ key: 'sphr', type: 'real', value: 0.3 }),
    entry({ key: 'ring', type: 'boolean', value: false }),
    entry({ key: 'thickness', type: 'real', value: 0.2 }),
    // anisou-only disc controls
    entry({ key: 'drawdisc', type: 'boolean', value: true }),
    entry({ key: 'discscale', type: 'real', value: 1.1 }),
    entry({ key: 'discthick', type: 'real', value: 0.1 }),
    // internal cap -- never surfaced as a curated row
    entry({ key: 'maxverts', type: 'integer', value: 1000000 }),
  ]
}

describe('AnIsoURenderer section registry', () => {
  it('resolves type_name "anisou" to ball-and-stick then disc sections', () => {
    const sections = getRendererPropSections('anisou')
    expect(sections.map((s) => s.title)).toEqual([
      'Atoms and bonds',
      'Anisotropic displacement',
    ])
    expect(sections.every((s) => s.defaultExpanded)).toBe(true)
    expect(sections[0].Component).toBe(BallStickRendererSection)
    expect(sections[1].Component).toBe(AnIsoUDiscSection)
    expect(RENDERER_SECTION_REGISTRY.anisou).toBe(sections)
  })
})

describe('AnIsoUDiscSection', () => {
  it('renders drawdisc, scale and thickness rows when present', () => {
    const { container, unmount } = mountTree(
      <AnIsoUDiscSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Draw disc')).not.toBeNull()
    expect(rowByLabel(container, 'Disc scale')).not.toBeNull()
    expect(rowByLabel(container, 'Disc thickness')).not.toBeNull()
    // The internal vertex cap is not surfaced here.
    expect(rowByLabel(container, 'maxverts')).toBeNull()
    unmount()
  })

  it('omits a disc row when its property is absent', () => {
    const { container, unmount } = mountTree(
      <AnIsoUDiscSection
        entries={[entry({ key: 'drawdisc', type: 'boolean', value: true })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Draw disc')).not.toBeNull()
    expect(rowByLabel(container, 'Disc scale')).toBeNull()
    unmount()
  })

  it('disables scale and thickness while drawdisc is off', () => {
    const off = [
      entry({ key: 'drawdisc', type: 'boolean', value: false }),
      entry({ key: 'discscale', type: 'real', value: 1.1 }),
      entry({ key: 'discthick', type: 'real', value: 0.1 }),
    ]
    const { container, unmount } = mountTree(
      <AnIsoUDiscSection entries={off} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    const scaleArrow = rowByLabel(container, 'Disc scale')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(scaleArrow.disabled).toBe(true)
    const thickArrow = rowByLabel(container, 'Disc thickness')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(thickArrow.disabled).toBe(true)
    unmount()
  })

  it('enables scale and thickness while drawdisc is on', () => {
    const { container, unmount } = mountTree(
      <AnIsoUDiscSection
        entries={fullEntries()}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const scaleArrow = rowByLabel(container, 'Disc scale')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    expect(scaleArrow.disabled).toBe(false)
    unmount()
  })

  it('commits a plain single-step change of disc scale on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <AnIsoUDiscSection
        entries={fullEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const incr = rowByLabel(container, 'Disc scale')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // step 0.05 from 1.1 -> 1.15, committed as a plain single step (no realtime
    // preview opts).
    expect(onSet).toHaveBeenCalledWith('discscale', 'real', 1.15)
    unmount()
  })
})

describe('PropertiesTab anisou section dispatch', () => {
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

  it('shows the Atoms and bonds and disc sections (no placeholder) for anisou', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="anisou" {...commonProps} />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Atoms and bonds')
    expect(titles).toContain('Anisotropic displacement')
    expect(titles).not.toContain('Renderer settings')
    unmount()
  })

  it('routes disc rows to the disc section and base rows to the ball-and-stick section', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="anisou" {...commonProps} />,
    )
    // Exclusive accordions: open each section in turn to inspect its body.
    openAccordion(container, 'Atoms and bonds')
    const baseBody = sectionBody(container, 'Atoms and bonds')!
    expect(rowByLabel(baseBody, 'Atom radius')).not.toBeNull()
    expect(rowByLabel(baseBody, 'Draw disc')).toBeNull()
    openAccordion(container, 'Anisotropic displacement')
    const discBody = sectionBody(container, 'Anisotropic displacement')!
    expect(rowByLabel(discBody, 'Draw disc')).not.toBeNull()
    expect(rowByLabel(discBody, 'Atom radius')).toBeNull()
    unmount()
  })
})
