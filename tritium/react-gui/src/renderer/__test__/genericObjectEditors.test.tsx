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
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import {
  GenericTab,
  cppTimeToMs,
  msToCppTime,
} from '../components/inspector/GenericTab'
import { parseVector, formatVector } from '../h3-kit/form'
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps'

void React

// The colour picker reads the theme and the CueMol client from context;
// the harness mounts without those providers, so stub the hooks it needs.
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}))
vi.mock('../h3-kit/colorpicker/ColorPickerContext', () => ({
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
