/**
 * Renderer-group inspector page contract.
 *
 * A RendGroup inherits the full Renderer property set in C++ (opacity /
 * material / edge lines / ...) but draws nothing itself, so those inherited
 * properties are dead knobs. Pins that PropertiesTab routes `*group` targets
 * to the dedicated minimal page: only Name / Visible / Locked are rendered;
 * the renderer-common "Edge lines" section, the Opacity / Material rows and
 * the "Renderer settings" placeholder must NOT appear.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// PropertiesTab -> RendererCommonSection -> MaterialRow uses useCueMol.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

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

/** The inherited-Renderer property dump a live `*group` produces. */
function groupEntries(): GenericPropEntry[] {
  return [
    entry({ key: 'name', type: 'string', value: 'group1' }),
    entry({ key: 'visible', type: 'boolean', value: true }),
    entry({ key: 'locked', type: 'boolean', value: false }),
    // Dead inherited knobs that must stay hidden:
    entry({ key: 'alpha', type: 'real', value: 1 }),
    entry({ key: 'material', type: 'string', value: '' }),
    entry({ key: 'egtype', type: 'enum', value: 'none', enumdef: ['none', 'edges'] }),
    entry({ key: 'eglinew', type: 'real', value: 0.02 }),
    entry({ key: 'egcolor', type: 'object<AbstractColor>', value: '#000000' }),
    entry({ key: 'ui_collapsed', type: 'boolean', value: false }),
  ]
}

function labels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.h3-form-field-label')).map(
    (l) => l.textContent ?? '',
  )
}

function accordionTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.insp-accordion-title')).map(
    (t) => t.textContent ?? '',
  )
}

describe('PropertiesTab for a renderer group (*group)', () => {
  it('shows only Name / Visible / Locked; hides edge lines, opacity, material and the placeholder', () => {
    const { container, unmount } = mountTree(
      <PropertiesTab
        entries={groupEntries()}
        rendererType="*group"
        onSet={() => {}}
        onReset={() => {}}
        sceneId={1}
        nodeId={50}
      />,
    )
    expect(accordionTitles(container)).toEqual(['Basic settings'])
    const shown = labels(container)
    expect(shown).toContain('Name')
    expect(shown).toContain('Visible')
    expect(shown).toContain('Locked')
    for (const dead of ['Opacity', 'Material', 'Edge type', 'Width', 'Color']) {
      expect(shown).not.toContain(dead)
    }
    // No type-section placeholder either.
    expect(container.textContent).not.toContain('Renderer settings')
    expect(container.textContent).not.toContain('Not implemented yet')
    unmount()
  })
})
