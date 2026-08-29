/**
 * @file components/inspector/SchemaSection.test.tsx
 * @description What the schema engine decides.
 *
 * The engine owns no editing behaviour -- the draft, the commit timing and
 * the reset stay in the row components -- so what is pinned here is the part
 * it does own: which rows a section shows and in what state. The rest is
 * covered by the parity snapshots, which compare whole pages.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from '../../__test__/helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'
import { SchemaSection } from './SchemaSection'
import type { PropCtx, SchemaSectionDef } from './schema/types'
import { makePropCtx } from './schema/types'

void React

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))

function entry(over: Partial<GenericPropEntry>): GenericPropEntry {
  return {
    key: '', type: 'real', value: 0, readonly: false, hasdefault: false,
    isdefault: false, isContainer: false, depth: 0, ...over,
  } as GenericPropEntry
}

const numRow = (key: string, label: string, extra: Record<string, unknown> = {}) =>
  ({ kind: 'num' as const, key, label, min: 0, max: 10, step: 0.2, ...extra })

/** Mount a section open, so its rows are in the DOM to assert on. */
function mount(section: SchemaSectionDef, entries: GenericPropEntry[]) {
  return mountTree(
    <SchemaSection
      section={{ defaultExpanded: true, ...section }}
      entries={entries}
      rendererType="test"
      sceneId={1}
      nodeId={100}
      onSet={vi.fn()}
      onReset={vi.fn()}
    />,
  )
}

/** Row labels of the rendered section, in order. */
function labels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.h3-form-field-label')).map(
    (l) => l.textContent ?? '',
  )
}

const isOff = (key: string) => (ctx: PropCtx) => ctx.value(key) !== true

describe('SchemaSection', () => {
  it('drops a row whose property the renderer does not expose', () => {
    // Absence is not a gate: it means this renderer has no such property, and
    // the hand-written sections opened with the same check.
    const section: SchemaSectionDef = {
      key: 's', title: 'S', rows: [numRow('width', 'Width'), numRow('absent', 'Absent')],
    }
    const { container, unmount } = mount(section, [entry({ key: 'width', value: 1 })])
    expect(labels(container)).toEqual(['Width'])
    unmount()
  })

  it('renders a gated-out row as disabled, not as missing', () => {
    // A property that exists but does not currently apply stays visible, so
    // the page does not reflow as values change.
    const section: SchemaSectionDef = {
      key: 's', title: 'S',
      rows: [numRow('sharp', 'Sharpness', { disabledWhen: isOff('square') })],
    }
    const entries = [entry({ key: 'sharp', value: 0.4 }), entry({ key: 'square', type: 'boolean', value: false })]
    const { container, unmount } = mount(section, entries)
    expect(labels(container)).toEqual(['Sharpness'])
    expect(container.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    unmount()

    const on = [entry({ key: 'sharp', value: 0.4 }), entry({ key: 'square', type: 'boolean', value: true })]
    const live = mount(section, on)
    expect(live.container.querySelector('.h3-form-drag-disabled')).toBeNull()
    live.unmount()
  })

  it('a row can also be gated away entirely', () => {
    const section: SchemaSectionDef = {
      key: 's', title: 'S',
      rows: [numRow('sharp', 'Sharpness', { visibleWhen: () => false })],
    }
    const { container, unmount } = mount(section, [entry({ key: 'sharp', value: 0.4 })])
    expect(labels(container)).toEqual([])
    unmount()
  })

  it("a disabled section disables its rows", () => {
    const section: SchemaSectionDef = {
      key: 's', title: 'S', disabledWhen: () => true, rows: [numRow('width', 'Width')],
    }
    const { container, unmount } = mount(section, [entry({ key: 'width', value: 1 })])
    expect(container.querySelector('.h3-form-drag-disabled')).not.toBeNull()
    unmount()
  })

  it('a gated-away section renders nothing at all', () => {
    const section: SchemaSectionDef = {
      key: 's', title: 'S', visibleWhen: () => false, rows: [numRow('width', 'Width')],
    }
    const { container, unmount } = mount(section, [entry({ key: 'width', value: 1 })])
    expect(container.querySelector('.insp-accordion')).toBeNull()
    unmount()
  })

  it('hideWhenEmpty drops a section none of whose rows survived', () => {
    // A renderer that exposes none of a section's properties should not show
    // an empty accordion.
    const section: SchemaSectionDef = {
      key: 's', title: 'S', hideWhenEmpty: true, rows: [numRow('absent', 'Absent')],
    }
    const { container, unmount } = mount(section, [entry({ key: 'width', value: 1 })])
    expect(container.querySelector('.insp-accordion')).toBeNull()
    unmount()

    // Without the flag the accordion stays, as most sections want.
    const kept = mount({ ...section, hideWhenEmpty: false }, [entry({ key: 'width', value: 1 })])
    expect(kept.container.querySelector('.insp-accordion')).not.toBeNull()
    kept.unmount()
  })

  it('keeps the rows in the order the schema lists them', () => {
    const section: SchemaSectionDef = {
      key: 's', title: 'S',
      rows: [numRow('c', 'C'), numRow('a', 'A'), numRow('b', 'B')],
    }
    const entries = ['a', 'b', 'c'].map((k) => entry({ key: k, value: 1 }))
    const { container, unmount } = mount(section, entries)
    expect(labels(container)).toEqual(['C', 'A', 'B'])
    unmount()
  })
})

describe('makePropCtx', () => {
  it('reads properties by key, and reports an absent one as undefined', () => {
    const ctx = makePropCtx(
      [entry({ key: 'width', value: 1.5 }), entry({ key: 'on', type: 'boolean', value: true })],
      'tube', 7, 42,
    )
    expect(ctx.value('width')).toBe(1.5)
    expect(ctx.value('on')).toBe(true)
    expect(ctx.value('absent')).toBeUndefined()
    expect(ctx.get('absent')).toBeUndefined()
    expect(ctx.rendererType).toBe('tube')
    expect(ctx.sceneId).toBe(7)
    expect(ctx.nodeId).toBe(42)
  })
})
