/**
 * DensityMap OBJECT page wiring contract.
 *
 * The object's map kind decides whether the map is periodic and how every map
 * renderer's `region_mode: auto` resolves (docs/architecture/cryo-em-map-mode),
 * so it is a property of the data, not of a renderer. Until now it was only
 * reachable through the Generic tab's raw property table.
 *
 * The pins:
 *   - PropertiesTab routes an OBJECT through the type registry (it used to
 *     stop at the common page), so a DensityMap gets a "Density map" section
 *     after "Basic settings" and an object class with no entry still gets the
 *     common page alone;
 *   - "Map type" writes the raw `map_type` enum ids with the file-open pane's
 *     wording;
 *   - "Effective kind" is static text (what `auto` resolved to), not a
 *     control, and disappears when nothing resolved.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))
vi.mock('@renderer/h3-kit/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel }: { selectedSel: string }) => (
    <input data-testid="molsel" defaultValue={selectedSel} readOnly />
  ),
}))

import { PropertiesTab } from '@renderer/features/inspector/PropertiesTab'
import { SchemaSection } from '@renderer/features/inspector/SchemaSection'
import { DENSITY_MAP_SECTIONS } from '@renderer/features/inspector/schema/densitymap'
import { getRendererPropSections } from '@renderer/features/inspector/rendererPropSections'

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

/** What `getPropsJSON()` reports for a DensityMap, reduced to the page's keys. */
function mapEntries(over?: { mapType?: string; resolved?: string }): GenericPropEntry[] {
  return [
    entry({ key: 'name', type: 'string', value: 'emd_1234' }),
    entry({ key: 'visible', type: 'boolean', value: true }),
    entry({
      key: 'map_type',
      type: 'enum',
      value: over?.mapType ?? 'auto',
      enumdef: ['auto', 'em', 'xtal'],
      hasdefault: true,
      isdefault: true,
      defaultValue: 'auto',
    }),
    entry({
      key: 'map_type_resolved',
      type: 'string',
      value: over?.resolved ?? 'em',
      readonly: true,
    }),
  ]
}

function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

function accordionTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
    (t) => t.textContent ?? '',
  )
}

function selectValue(select: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('the DensityMap object page', () => {
  it('registers under the object class name', () => {
    expect(getRendererPropSections('DensityMap')).toBe(DENSITY_MAP_SECTIONS)
  })

  it('follows Basic settings with a Density map section', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={mapEntries()}
        rendererType="DensityMap"
        isObject
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(accordionTitles(container)).toEqual(['Basic settings', 'Density map'])
    unmount()
  })

  it('leaves an object class with no page on the common page alone', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={mapEntries()}
        rendererType="MolCoord"
        isObject
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(accordionTitles(container)).toEqual(['Basic settings'])
    unmount()
  })

  it('writes map_type as raw enum ids in Auto / Crystallographic / Cryo-EM order', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DENSITY_MAP_SECTIONS[0]}
        rendererType="DensityMap"
        entries={mapEntries()}
        onSet={onSet}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const sel = rowByLabel(container, 'Map type')!.querySelector('select') as HTMLSelectElement
    // The C++ enumdef is alphabetical (auto/em/xtal); the row fixes the order.
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['auto', 'xtal', 'em'])
    expect(sel.value).toBe('auto')

    selectValue(sel, 'em')
    expect(onSet).toHaveBeenCalledWith('map_type', 'enum', 'em')
    unmount()
  })

  it('shows what auto resolved to as static text', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DENSITY_MAP_SECTIONS[0]}
        rendererType="DensityMap"
        entries={mapEntries({ resolved: 'xtal' })}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const row = rowByLabel(container, 'Effective kind')!
    expect(row.querySelector('.insp-prop-readonly')?.textContent).toBe('Crystallographic')
    expect(row.querySelector('input, select, button')).toBeNull()
    unmount()
  })

  it('drops the whole section for a scalar object with no map kind', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={[entry({ key: 'name', type: 'string', value: 'pot1' })]}
        rendererType="DensityMap"
        isObject
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(accordionTitles(container)).toEqual(['Basic settings'])
    unmount()
  })
})
