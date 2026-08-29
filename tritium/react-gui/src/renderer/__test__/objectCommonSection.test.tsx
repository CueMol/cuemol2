/**
 * ObjectCommonSection wiring contract (UXP `object-propdlg` "Common" tab port).
 *
 * Pins the observable behaviour of the object-common inspector page:
 *   - renders Name / Selection / Visible / Locked / Linked rows only for the
 *     properties present on the inspected object (Selection only on MolCoord,
 *     Linked = read-only `src`);
 *   - Visible toggles emit `onSet('visible', 'boolean', <checked>)`;
 *   - Linked (`src`) is read-only;
 *   - PropertiesTab with `isObject` shows the object-common page (no renderer
 *     placeholder), and without it falls back to the renderer page.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '../worker/server/services/genericProps.service'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
// RendererCommonSection (imported for the shared row helpers) uses useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))
// SelRow embeds MolSelList; stub it so a `sel` entry renders without the
// full selection widget (its own contract is covered elsewhere).
vi.mock('../h3-kit/MolSelList/MolSelList', () => ({
  MolSelList: ({ selectedSel }: { selectedSel: string }) => (
    <input data-testid="molsel" defaultValue={selectedSel} readOnly />
  ),
}))

import { ObjectCommonSection } from '../components/inspector/ObjectCommonSection'
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

/** Object property entries: Name, Visible, Locked, Linked (read-only src). */
function objectEntries(): GenericPropEntry[] {
  return [
    entry({ key: 'name', type: 'string', value: '1CRN' }),
    entry({ key: 'visible', type: 'boolean', value: true }),
    entry({ key: 'locked', type: 'boolean', value: false }),
    entry({ key: 'src', type: 'string', value: '/data/1crn.pdb', readonly: true }),
  ]
}

function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

describe('ObjectCommonSection', () => {
  it('renders Name / Visible / Locked / Linked rows; no Selection without sel', () => {
    const { container, unmount } = mountTree(
      <ObjectCommonSection entries={objectEntries()} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    expect(rowByLabel(container, 'Name')).not.toBeNull()
    expect(rowByLabel(container, 'Visible')).not.toBeNull()
    expect(rowByLabel(container, 'Locked')).not.toBeNull()
    expect(rowByLabel(container, 'Linked')).not.toBeNull()
    expect(rowByLabel(container, 'Selection')).toBeNull()
    unmount()
  })

  it('renders the Selection row when the object has a sel property', () => {
    const { container, unmount } = mountTree(
      <ObjectCommonSection
        entries={[...objectEntries(), entry({ key: 'sel', type: 'object', value: 'A.10-20' })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Selection')).not.toBeNull()
    unmount()
  })

  it('marks Linked (src) read-only', () => {
    const { container, unmount } = mountTree(
      <ObjectCommonSection entries={objectEntries()} onSet={vi.fn()} onReset={vi.fn()} sceneId={1} />,
    )
    const input = rowByLabel(container, 'Linked')!.querySelector('input') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    unmount()
  })

  it('commits a Visible toggle via onSet', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <ObjectCommonSection entries={objectEntries()} onSet={onSet} onReset={vi.fn()} sceneId={1} />,
    )
    const toggle = rowByLabel(container, 'Visible')!.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement
    act(() => toggle.click())
    expect(onSet).toHaveBeenCalledWith('visible', 'boolean', false)
    unmount()
  })

  it('renders nothing when the object exposes none of the known fields', () => {
    const { container, unmount } = mountTree(
      <ObjectCommonSection
        entries={[entry({ key: 'other', type: 'string', value: 'x' })]}
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    expect(rowByLabel(container, 'Name')).toBeNull()
    unmount()
  })
})

describe('PropertiesTab object vs renderer dispatch', () => {
  function accordionTitles(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
      (t) => t.textContent ?? '',
    )
  }

  it('shows the object-common page (Basic settings, no placeholder) when isObject', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={objectEntries()}
        rendererType="MolCoord"
        isObject
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    const titles = accordionTitles(container)
    expect(titles).toContain('Basic settings')
    expect(titles).not.toContain('Renderer settings')
    expect(rowByLabel(container, 'Name')).not.toBeNull()
    unmount()
  })

  it('falls back to the renderer page (placeholder) when not isObject', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={objectEntries()}
        rendererType="no_such_renderer"
        onSet={vi.fn()}
        onReset={vi.fn()}
        sceneId={1}
      />,
    )
    // Renderer fallback shows the "Renderer settings" placeholder section.
    expect(accordionTitles(container)).toContain('Renderer settings')
    unmount()
  })
})
