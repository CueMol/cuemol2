/**
 * @file __test__/genericObjectEditors.test.tsx
 * @description Pins the object-valued property editors in the Generic tab
 * (colour / vector / time) and the string forms they round-trip through.
 *
 * These properties reach the renderer as their C++ `toString()` text (every
 * one of them has `isStrConv() == true`), so the editors are only correct if
 * they read and rewrite exactly that text. The conversion tests below are the
 * real contract; the render tests just pin which control each type gets.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, useState } from 'react'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import {
  GenericTab,
  cppTimeToMs,
  msToCppTime,
} from '@renderer/features/inspector/GenericTab'
import { parseVector, formatVector } from '@renderer/h3-kit/form'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// The colour picker reads the theme and the CueMol client from context;
// the harness mounts without those providers, so stub the hooks it needs.
vi.mock('@renderer/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}))
vi.mock('@renderer/h3-kit/colorpicker/ColorPickerContext', () => ({
  ColorPickerProvider: ({ children }: { children: React.ReactNode }) => children,
  useColorPickerCtx: () => ({ cm: null, sceneId: undefined }),
}))

function entryOf(over: Partial<GenericPropEntry>): GenericPropEntry {
  return {
    key: 'p',
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

const mountWith = (over: Partial<GenericPropEntry>) => {
  const view = mountTree(
    <GenericTab entries={[entryOf(over)]} onSetValue={vi.fn()} onResetValue={vi.fn()} />,
  )
  act(() => (view.container.querySelector('tr.insp-gt-row') as HTMLElement).click())
  return view
}

describe('cppTimeToMs / msToCppTime (qlib::LScrTime string form)', () => {
  // The fractional part is an integer millisecond count, not a decimal
  // fraction: LScrTime::toString writes it with fromInt and setStrValue reads
  // it with toInt. "1.50" is therefore 1050 ms, and reading it as .50 of a
  // second (what the form-kit parseTime does) would yield 1500 ms.
  it('reads the fraction as integer milliseconds, not tenths', () => {
    expect(cppTimeToMs('1.50')).toBe(1050)
    expect(cppTimeToMs('1.5')).toBe(1005)
    expect(cppTimeToMs('1.500')).toBe(1500)
  })

  it('round-trips every shape LScrTime::toString can emit', () => {
    for (const ms of [0, 250, 1005, 1050, 1500, 60000, 61500, 3600000, 3661500]) {
      expect(cppTimeToMs(msToCppTime(ms)), `${ms} ms`).toBe(ms)
    }
  })

  it('emits the same text C++ does (no zero padding, fraction omitted at .000)', () => {
    expect(msToCppTime(1050)).toBe('1.50')
    expect(msToCppTime(60000)).toBe('1:0')
    expect(msToCppTime(3661500)).toBe('1:1:1.500')
    expect(msToCppTime(2000)).toBe('2')
  })

  it('rejects malformed text so the caller can fall back to raw editing', () => {
    for (const bad of ['', 'abc', '1:2:3:4', '1.2.3', '-5', '1:x']) {
      expect(cppTimeToMs(bad), bad).toBeNull()
    }
  })
})

describe('parseVector / formatVector (qlib::Vector4D string form)', () => {
  it('round-trips 3- and 4-component vectors, preserving the component count', () => {
    expect(parseVector('(1,2,3)')).toEqual([1, 2, 3])
    expect(parseVector('(1,2,3,4)')).toEqual([1, 2, 3, 4])
    expect(formatVector([1, 2, 3])).toBe('(1,2,3)')
    expect(formatVector([1, 2, 3, 4])).toBe('(1,2,3,4)')
  })

  it('accepts the real-number and whitespace forms C++ emits', () => {
    expect(parseVector('(0.5,-1.25,3)')).toEqual([0.5, -1.25, 3])
    expect(parseVector(' (1, 2, 3) ')).toEqual([1, 2, 3])
  })

  it('rejects anything that is not a 3/4-component tuple', () => {
    for (const bad of ['', '1,2,3', '(1,2)', '(1,2,3,4,5)', '(a,b,c)']) {
      expect(parseVector(bad), bad).toBeNull()
    }
  })
})

describe('GenericTab object-property editors', () => {
  it('gives a colour property the colour picker field', () => {
    const view = mountWith({
      type: 'object<AbstractColor$>',
      value: '#ff0000',
    })
    expect(
      view.container.querySelector('.insp-generic-detail-editor .h3-color-widget'),
    ).not.toBeNull()
    view.unmount()
  })

  it('gives a vector property one labelled cell per component', () => {
    const view = mountWith({ type: 'object<Vector>', value: '(1,2,3)' })
    const cells = view.container.querySelectorAll(
      '.insp-generic-detail-editor .h3-form-vector-cell',
    )
    expect(cells).toHaveLength(3)
    expect(
      [...cells].map((c) => c.querySelector('.h3-form-vector-axis')?.textContent),
    ).toEqual(['x', 'y', 'z'])
    view.unmount()
  })

  it('gives a time property the timecode field', () => {
    const view = mountWith({ type: 'object<TimeValue>', value: '1:30.500' })
    expect(
      view.container.querySelector('.insp-generic-detail-editor .h3-form-time'),
    ).not.toBeNull()
    view.unmount()
  })

  it('falls back to the raw text editor for a malformed time value', () => {
    // Better to show the offending text than to silently display 0.
    const view = mountWith({ type: 'object<TimeValue>', value: 'not-a-time' })
    expect(
      view.container.querySelector('.insp-generic-detail-editor .h3-form-time'),
    ).toBeNull()
    expect(
      view.container.querySelector('.insp-generic-detail-editor .h3-form-input'),
    ).not.toBeNull()
    view.unmount()
  })
})

describe('TimeValue editor realtime protocol', () => {
  const timeEntry = (value: string) =>
    entryOf({ key: 'start', type: 'object<TimeValue>', value })
  const moveBy = (dx: number) => {
    const ev = new MouseEvent('mousemove')
    Object.defineProperty(ev, 'movementX', { value: dx, configurable: true })
    act(() => document.dispatchEvent(ev))
  }

  it('previews as the C++ time string with mode preview, then commits once with the original', () => {
    const onSetValue = vi.fn()
    const view = mountTree(
      <GenericTab entries={[timeEntry('1.50')]} onSetValue={onSetValue} onResetValue={vi.fn()} />,
    )
    act(() => (view.container.querySelector('tr.insp-gt-row') as HTMLElement).click())
    const seg = view.container.querySelector(
      '.insp-generic-detail-editor [data-unit="s"]',
    ) as HTMLElement
    act(() => seg.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    moveBy(20) // +5 s: 1050 ms -> 6050 ms, which LScrTime writes as "6.50"
    expect(onSetValue).toHaveBeenCalledWith('start', 'object<TimeValue>', '6.50', { mode: 'preview' })
    act(() => document.dispatchEvent(new MouseEvent('mouseup')))
    expect(onSetValue).toHaveBeenLastCalledWith('start', 'object<TimeValue>', '6.50', {
      mode: 'commit',
      originalValue: '1.50',
      originalWasDefault: false,
    })
    expect(onSetValue).toHaveBeenCalledTimes(2)
    view.unmount()
  })

  it('keeps the detail editor mounted when the selected entry value changes', () => {
    // A live preview refetches the list mid-gesture; a remount here would
    // unmount the held field and cancel the gesture.
    let setEntries!: (e: GenericPropEntry[]) => void
    const Host: React.FC = () => {
      const [entries, set] = useState<GenericPropEntry[]>([timeEntry('1.50')])
      setEntries = set
      return <GenericTab entries={entries} onSetValue={vi.fn()} onResetValue={vi.fn()} />
    }
    const view = mountTree(<Host />)
    act(() => (view.container.querySelector('tr.insp-gt-row') as HTMLElement).click())
    const before = view.container.querySelector('.insp-generic-detail-editor .h3-form-time')
    expect(before).not.toBeNull()
    act(() => setEntries([timeEntry('2.50')]))
    const after = view.container.querySelector('.insp-generic-detail-editor .h3-form-time')
    expect(after).toBe(before)
    expect(after?.querySelector('.h3-form-time-segs')?.textContent).toBe('0:02.050')
    view.unmount()
  })
})
