/**
 * useColumnResize persistence contract.
 *
 * Pins that resizable column widths survive a remount via localStorage
 * (the GenericTab "widths reset on node switch" bug): the inspector
 * unmounts/remounts GenericTab on target change, so the widths must be
 * restored from storage rather than from the hook's in-memory state.
 */

import type React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { makeRenderHook } from './helpers/testHarness'
import { useColumnResize } from '../hooks/useColumnResize'

const KEY = 'test.colWidths'
const INITIAL = { name: 120, type: 80 }

beforeEach(() => {
  localStorage.clear()
})

/** Minimal React.MouseEvent stand-in for startResize. */
function fakeMouseEvent(clientX: number): React.MouseEvent {
  return {
    clientX,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent
}

describe('useColumnResize', () => {
  it('restores persisted widths from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify({ name: 200, type: 150 }))
    const h = makeRenderHook(() => useColumnResize(INITIAL, undefined, KEY))
    expect(h.result.widths).toEqual({ name: 200, type: 150 })
    h.unmount()
  })

  it('persists widths to localStorage after a resize drag', () => {
    const h = makeRenderHook(() => useColumnResize(INITIAL, undefined, KEY))

    act(() => h.result.startResize('name', fakeMouseEvent(100)))
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 }))
    })
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(h.result.widths.name).toBe(180) // 120 + (160 - 100)
    expect(JSON.parse(localStorage.getItem(KEY)!).name).toBe(180)
    h.unmount()
  })

  it('falls back to initialWidths on corrupt storage', () => {
    localStorage.setItem(KEY, 'not json{')
    const h = makeRenderHook(() => useColumnResize(INITIAL, undefined, KEY))
    expect(h.result.widths).toEqual(INITIAL)
    h.unmount()
  })

  it('clamps restored widths to the minimum width', () => {
    // name below MIN_COL_WIDTH (40) is clamped; type is kept as-is.
    localStorage.setItem(KEY, JSON.stringify({ name: 5, type: 150 }))
    const h = makeRenderHook(() => useColumnResize(INITIAL, undefined, KEY))
    expect(h.result.widths).toEqual({ name: 40, type: 150 })
    h.unmount()
  })
})
