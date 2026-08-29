/**
 * Disorder (DisoRenderer) property-section wiring contract.
 *
 * Pins the observable behaviour of the `disorder` renderer's inspector page
 * migrated from the UXP `disorder-propdlg` "Disorder" tab.
 *
 * The pins:
 *   - the registry resolves `type_name === "disorder"` to a single
 *     "Disorder" section (default-expanded);
 *   - each row renders only when its property exists;
 *   - "Detail" uses the plain inline stepper NumericField (no slider, no drag
 *     arrows) and commits a single-step integer `onSet`;
 *   - a drag-numeric row (Dot size) commits a plain single step (no realtime opts);
 *   - the Target selector always offers "(none)" and keeps the current value
 *     selectable even when no sibling-renderer names are available;
 *   - "Loop size 2" is gated by a checkbox because C++ reads a non-positive
 *     value as "fall back to Loop size": off leaves the field inert, ticking
 *     it writes a usable size, and unticking writes the -1 sentinel back.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow } from './helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// DisoMainSection -> TargetRow uses useCueMol; null cm keeps the name list empty.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

// Stub the colour leaf so ColorField renders without the ColorPicker context.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
  CueColorField: ({ value, onCommit, disabled }: any) => (
    <button
      data-testid="color"
      data-disabled={String(!!disabled)}
      onClick={() => onCommit('red')}
    >
      {value}
    </button>
  ),
}))

import { SchemaSection } from '../components/inspector/SchemaSection'
import { DISORDER_SECTIONS } from '../components/inspector/schema/disorder'
import {

  getRendererPropSections,
  RENDERER_SECTION_REGISTRY,
} from '../components/inspector/rendererPropSections'


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

/** Set a controlled <input> value so React's value tracker fires onChange. */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** The right step arrow of a drag-numeric row (present only for DragNumericField). */
function dragArrow(row: HTMLElement): HTMLButtonElement | null {
  return row.querySelector('.h3-form-drag-arrow-right') as HTMLButtonElement | null
}

function disoEntries(over?: { loopsize2?: number }): GenericPropEntry[] {
  return [
    entry({ key: 'target', type: 'string', value: 'tube1' }),
    entry({ key: 'detail', type: 'integer', value: 5 }),
    entry({ key: 'width', type: 'real', value: 0.3 }),
    entry({ key: 'dotsep', type: 'real', value: 1.0 }),
    entry({ key: 'loopsize', type: 'real', value: 2.0 }),
    entry({ key: 'loopsize2', type: 'real', value: over?.loopsize2 ?? -1.0 }),
    entry({ key: 'defaultcolor', type: 'object<AbstractColor>', value: '#ffffff' }),
  ]
}

describe('Disorder renderer section registry', () => {
  it('resolves type_name "disorder" to a single default-expanded "Disorder" section', () => {
    const sections = getRendererPropSections('disorder')
    expect(sections.map((s) => s.title)).toEqual(['Disorder'])
    expect(sections[0].defaultExpanded).toBe(true)
    expect(RENDERER_SECTION_REGISTRY.disorder).toBe(sections)
  })
})

describe('the disorder page', () => {
  it('renders the curated rows when present', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries()}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(rowByLabel(container, 'Target')).not.toBeNull()
    expect(rowByLabel(container, 'Detail')).not.toBeNull()
    expect(rowByLabel(container, 'Dot size')).not.toBeNull()
    expect(rowByLabel(container, 'Dot separation')).not.toBeNull()
    expect(rowByLabel(container, 'Loop size')).not.toBeNull()
    expect(rowByLabel(container, 'Loop size 2')).not.toBeNull()
    expect(rowByLabel(container, 'Color')).not.toBeNull()
    unmount()
  })

  it('omits a row when its property is absent', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={[entry({ key: 'detail', type: 'integer', value: 5 })]}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(rowByLabel(container, 'Detail')).not.toBeNull()
    expect(rowByLabel(container, 'Dot size')).toBeNull()
    expect(rowByLabel(container, 'Target')).toBeNull()
    unmount()
  })

  it('renders Detail as a stepper NumericField (no slider, no drag arrows)', () => {
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries()}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const detail = rowByLabel(container, 'Detail')!
    expect(detail.querySelector('.h3-form-numeric-row')).not.toBeNull()
    expect(detail.querySelector('.h3-form-slider')).toBeNull()
    expect(dragArrow(detail)).toBeNull()
    unmount()
  })

  it('commits Detail as a single-step integer on Enter', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries()}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const input = rowByLabel(container, 'Detail')!.querySelector('input') as HTMLInputElement
    act(() => typeInto(input, '8'))
    act(() =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    )
    expect(onSet).toHaveBeenCalledWith('detail', 'integer', 8)
    unmount()
  })

  it('commits a drag-numeric row as a plain single step (Dot size)', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries()}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const incr = dragArrow(rowByLabel(container, 'Dot size')!)!
    pressStepArrow(incr)
    // step 0.1 from 0.3 -> 0.4, committed as a plain single step (no realtime opts).
    expect(onSet).toHaveBeenCalledWith('width', 'real', 0.4)
    unmount()
  })

  it('offers "(none)" and keeps the current Target value selectable', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries()}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const select = rowByLabel(container, 'Target')!.querySelector('select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('')
    expect(values).toContain('tube1')
    expect(select.value).toBe('tube1')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      )!.set!
      setter.call(select, '')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSet).toHaveBeenCalledWith('target', 'string', '')
    unmount()
  })
  it('leaves Loop size 2 inert while its checkbox is off, and turns it on with a usable size', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries()}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const row = rowByLabel(container, 'Loop size 2')!
    const gate = row.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(gate.checked).toBe(false)
    // The value half is dead while off, so a step writes nothing.
    expect(row.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    pressStepArrow(dragArrow(row)!)
    expect(onSet).not.toHaveBeenCalled()
    // Ticking it writes a positive size, never the sentinel.
    act(() => gate.click())
    expect(onSet).toHaveBeenCalledWith('loopsize2', 'real', 2)
    unmount()
  })

  it('unticking Loop size 2 writes the -1 sentinel, and reticking restores the last size', () => {
    const onSet = vi.fn()
    const { container, rerender, unmount } = mountTree(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries({ loopsize2: 1.5 })}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    const gate = () =>
      rowByLabel(container, 'Loop size 2')!.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(gate().checked).toBe(true)
    act(() => gate().click())
    expect(onSet).toHaveBeenCalledWith('loopsize2', 'real', -1)

    // The worker write comes back as a new entry list; the row now reads off.
    rerender(
      <SchemaSection
        section={DISORDER_SECTIONS[0]}
        entries={disoEntries()}
        rendererType="disorder"
        sceneId={1}
        nodeId={2}
        onSet={onSet}
        onReset={vi.fn()}
      />,
    )
    expect(gate().checked).toBe(false)
    onSet.mockClear()
    act(() => gate().click())
    // 1.5 is what it was before, not the 2 fallback.
    expect(onSet).toHaveBeenCalledWith('loopsize2', 'real', 1.5)
    unmount()
  })
})
