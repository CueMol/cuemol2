/**
 * BallStickRenderer property-section wiring contract.
 *
 * Pins the observable behaviour of the `ballstick` renderer's inspector page
 * migrated from the UXP `ballstick-propdlg` "Ball & Stick" tab:
 *   - the registry resolves `type_name === "ballstick"` to a single
 *     "Ball and stick" section;
 *   - the section renders a row per property only when that property exists
 *     (detail / bondw / sphr / ring / thickness / ringcolor);
 *   - `detail` shows as an integer (no fractional digit) and the radius / width
 *     rows carry the Angstrom unit;
 *   - the ring thickness / colour controls are disabled while `ring` is off
 *     (UXP updateEnabledState parity);
 *   - committing a numeric row emits a realtime single-step `onSet`;
 *   - PropertiesTab shows the section (no "Renderer settings" placeholder) for
 *     `ballstick`.
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

// Stub the colour leaf so ColorField renders without the ColorPicker context.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
  CueColorField: ({ value, onCommit, disabled }: any) => (
    <button
      data-testid="ringcolor"
      data-disabled={String(!!disabled)}
      onClick={() => onCommit('red')}
    >
      {value}
    </button>
  ),
}))

import { SchemaSection } from '../components/inspector/SchemaSection'
import { BALLSTICK_SECTIONS } from '../components/inspector/schema/ballstick'
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

/** All six properties present, ring on. */
function fullEntries(ringOn = true): GenericPropEntry[] {
  return [
    entry({ key: 'detail', type: 'integer', value: 3 }),
    entry({ key: 'bondw', type: 'real', value: 0.2 }),
    entry({ key: 'sphr', type: 'real', value: 0.3 }),
    entry({ key: 'ring', type: 'boolean', value: ringOn }),
    entry({ key: 'thickness', type: 'real', value: 0.2 }),
    entry({ key: 'ringcolor', type: 'object<AbstractColor>', value: 'yellow' }),
  ]
}

describe('BallStickRenderer section registry', () => {
  it('resolves type_name "ballstick" to a single expanded "Ball and stick" section', () => {
    const sections = getRendererPropSections('ballstick')
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Ball and stick')
    expect(sections[0].defaultExpanded).toBe(true)
    // A migrated page is rows as data, not a component.
    expect(isComponentSection(sections[0])).toBe(false)
    expect(componentOf(sections[0])).toBe('schema:ballstick')
    expect(RENDERER_SECTION_REGISTRY.ballstick).toBe(sections)
  })
})

describe('the ball-and-stick page', () => {
  it('renders one row per existing property', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={BALLSTICK_SECTIONS[0]}
        entries={fullEntries()}
        rendererType="ballstick"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    for (const label of [
      'Detail',
      'Bond width',
      'Atom radius',
      'Show ring',
      'Thickness',
      'Ring color',
    ]) {
      expect(rowByLabel(container, label)).not.toBeNull()
    }
    unmount()
  })

  it('omits a row when its property is absent', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={BALLSTICK_SECTIONS[0]}
        entries={[entry({ key: 'bondw', type: 'real', value: 0.2 })]}
        rendererType="ballstick"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(rowByLabel(container, 'Bond width')).not.toBeNull()
    expect(rowByLabel(container, 'Detail')).toBeNull()
    expect(rowByLabel(container, 'Show ring')).toBeNull()
    unmount()
  })

  it('shows detail as an integer and radius / width with the Angstrom unit', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={BALLSTICK_SECTIONS[0]}
        entries={fullEntries()}
        rendererType="ballstick"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    // detail = 3 -> integer display (decimals 0), no unit.
    const detail = rowByLabel(container, 'Detail')!
    expect(detail.querySelector('.h3-form-drag-value')!.textContent).toContain('3')
    expect(detail.querySelector('.h3-form-drag-value')!.textContent).not.toContain('.')
    expect(detail.querySelector('.h3-form-drag-unit')).toBeNull()
    // bondw / sphr / thickness carry the Angstrom unit.
    for (const label of ['Bond width', 'Atom radius', 'Thickness']) {
      expect(
        rowByLabel(container, label)!.querySelector('.h3-form-drag-unit')!.textContent,
      ).toBe('Å')
    }
    unmount()
  })

  it('disables thickness and ring color when ring is off', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={BALLSTICK_SECTIONS[0]}
        entries={fullEntries(false)}
        rendererType="ballstick"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(
      rowByLabel(container, 'Thickness')!
        .querySelector('.h3-form-drag')!
        .classList.contains('h3-form-drag-disabled'),
    ).toBe(true)
    expect(
      container.querySelector('[data-testid="ringcolor"]')!.getAttribute('data-disabled'),
    ).toBe('true')
    unmount()
  })

  it('enables thickness and ring color when ring is on', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={BALLSTICK_SECTIONS[0]}
        entries={fullEntries(true)}
        rendererType="ballstick"
        sceneId={1}
        nodeId={100}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(
      rowByLabel(container, 'Thickness')!
        .querySelector('.h3-form-drag')!
        .classList.contains('h3-form-drag-disabled'),
    ).toBe(false)
    expect(
      container.querySelector('[data-testid="ringcolor"]')!.getAttribute('data-disabled'),
    ).toBe('false')
    unmount()
  })

  it('commits a realtime single-step change of bond width on the step arrow', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={BALLSTICK_SECTIONS[0]}
        entries={fullEntries()}
        rendererType="ballstick"
        sceneId={1}
        nodeId={100}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const incr = rowByLabel(container, 'Bond width')!.querySelector(
      '.h3-form-drag-arrow-right',
    ) as HTMLButtonElement
    pressStepArrow(incr)
    // step 0.01 from 0.2 -> 0.21, committed live (preview restored to original first).
    expect(onSet).toHaveBeenCalledWith('bondw', 'real', 0.21, {
      mode: 'commit',
      originalValue: 0.2,
      originalWasDefault: false,
    })
    unmount()
  })
})

describe('PropertiesTab ballstick section dispatch', () => {
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

  it('shows the Ball and stick section (no placeholder) for the ballstick renderer', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab entries={fullEntries()} rendererType="ballstick" {...commonProps} />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Ball and stick')
    expect(titles).not.toContain('Renderer settings')
    openAccordion(container, 'Ball and stick')
    expect(rowByLabel(container, 'Bond width')).not.toBeNull()
    unmount()
  })
})
