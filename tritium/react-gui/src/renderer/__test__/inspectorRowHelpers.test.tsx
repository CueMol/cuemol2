/**
 * Multi-target row contract (features/inspector/rows).
 *
 * A control that stands for several properties has to write them in one undo
 * step, and one that shows a stored value in another unit has to round-trip
 * it. Both live on the shared rows, so this suite pins them there rather than
 * through any one page:
 *   - `writeMany`: 1 target -> `onSet`, 2+ targets -> `onSetMany` with the exact
 *     key / valueType / value array.
 *   - `MultiNumRow`: a 2-target drag row commits via `onSetMany`, applying the
 *     `toStored` transform; a 1-target drag row falls back to `onSet`.
 *   - the same row with one target IS the percentage row: stored 0.5 shows
 *     50 %, committing 60 % stores 0.4 (the inverted basw transform), and the
 *     field renders disabled when told.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree, pressStepArrow } from '@renderer/__test__/helpers/testHarness'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { writeMany, MultiNumRow } from '@renderer/features/inspector/rows'

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

function rowByLabel(container: HTMLElement, label: string): HTMLElement | null {
  const lab = Array.from(container.querySelectorAll('.h3-form-field-label')).find(
    (l) => l.textContent === label,
  )
  return lab ? (lab.closest('.h3-form-prop-row') as HTMLElement) : null
}

/** The right step arrow of a drag-numeric row. */
function dragArrow(row: HTMLElement): HTMLButtonElement {
  return row.querySelector('.h3-form-drag-arrow-right') as HTMLButtonElement
}

describe('writeMany', () => {
  it('routes a single target through onSet (not onSetMany)', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    writeMany(
      [entry({ key: 'sheethead.type', type: 'enum' })],
      'flat',
      onSet,
      onSetMany,
    )
    expect(onSet).toHaveBeenCalledWith('sheethead.type', 'enum', 'flat')
    expect(onSetMany).not.toHaveBeenCalled()
  })

  it('routes two targets through onSetMany with the exact write array', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    writeMany(
      [
        entry({ key: 'ribhelix_head.type', type: 'enum' }),
        entry({ key: 'ribhelix_tail.type', type: 'enum' }),
      ],
      'flat',
      onSet,
      onSetMany,
    )
    expect(onSet).not.toHaveBeenCalled()
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'ribhelix_head.type', valueType: 'enum', value: 'flat' },
      { key: 'ribhelix_tail.type', valueType: 'enum', value: 'flat' },
    ])
  })
})

describe('MultiNumRow', () => {
  it('commits a transformed value to two targets via onSetMany', () => {
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <MultiNumRow
        label="Arrow height"
        targets={[
          entry({ key: 'ribhelix_head.basw', type: 'real', value: 0.5 }),
          entry({ key: 'ribhelix_tail.basw', type: 'real', value: 0.5 }),
        ]}
        min={0}
        max={100}
        step={10}
        decimals={0}
        unit="%"
        toDisplay={(s) => (1 - s) * 100}
        toStored={(d) => (100 - d) / 100}
        onSet={vi.fn()}
        onSetMany={onSetMany}
        onReset={vi.fn()}
      />,
    )
    const row = rowByLabel(container, 'Arrow height')!
    // basw 0.5 -> (1 - 0.5) * 100 = 50 %
    expect(row.querySelector('.h3-form-drag-value')!.textContent).toContain('50')
    // 50 + 10 = 60 % -> basw = (100 - 60) / 100 = 0.4 for both targets
    pressStepArrow(dragArrow(row))
    expect(onSetMany).toHaveBeenCalledWith([
      { key: 'ribhelix_head.basw', valueType: 'real', value: 0.4 },
      { key: 'ribhelix_tail.basw', valueType: 'real', value: 0.4 },
    ])
    unmount()
  })

  it('falls back to onSet for a single target', () => {
    const onSet = vi.fn()
    const onSetMany = vi.fn()
    const { container, unmount } = mountTree(
      <MultiNumRow
        label="Cap power"
        targets={[entry({ key: 'sheethead.gamma', type: 'real', value: 2 })]}
        min={0.1}
        max={10}
        step={0.1}
        decimals={2}
        onSet={onSet}
        onSetMany={onSetMany}
        onReset={vi.fn()}
      />,
    )
    pressStepArrow(dragArrow(rowByLabel(container, 'Cap power')!))
    expect(onSetMany).not.toHaveBeenCalled()
    expect(onSet).toHaveBeenCalledWith('sheethead.gamma', 'real', 2.1)
    unmount()
  })
})

describe('a one-target row with a transform (the percentage row)', () => {
  it('shows the inverted percentage and commits the stored value back', () => {
    const onSet = vi.fn()
    const { container, unmount } = mountTree(
      <MultiNumRow
        label="Arrow height"
        targets={[entry({ key: 'helixhead.basw', type: 'real', value: 0.5 })]}
        min={0}
        max={100}
        step={10}
        decimals={0}
        unit="%"
        toDisplay={(s: number) => (1 - s) * 100}
        toStored={(d: number) => (100 - d) / 100}
        onSet={onSet}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    const row = rowByLabel(container, 'Arrow height')!
    expect(row.querySelector('.h3-form-drag-value')!.textContent).toContain('50')
    pressStepArrow(dragArrow(row))
    expect(onSet).toHaveBeenCalledWith('helixhead.basw', 'real', 0.4)
    unmount()
  })

  it('renders disabled when told', () => {
    const { container, unmount } = mountTree(
      <MultiNumRow
        label="Arrow width"
        targets={[entry({ key: 'helixhead.arrow', type: 'real', value: 1 })]}
        min={0}
        max={100}
        step={10}
        decimals={0}
        unit="%"
        toDisplay={(s: number) => (s - 1) * 50}
        toStored={(d: number) => d / 50 + 1}
        onSet={vi.fn()}
        onSetMany={vi.fn()}
        onReset={vi.fn()}
        disabled
      />,
    )
    expect(dragArrow(rowByLabel(container, 'Arrow width')!).disabled).toBe(true)
    unmount()
  })
})
