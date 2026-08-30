/**
 * @file __test__/useRealtimeDragProp.test.ts
 * @description Pins the wiring contract of `useRealtimeDragProp`: previews fire
 * only while dragging, a release commits exactly one step anchored on the
 * pre-drag value, a cancel rolls the draft back, and the field tracks the
 * committed value only while idle (not mid-drag).
 */

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi } from 'vitest'

import { makeRenderHook } from '@renderer/__test__/helpers/testHarness'
import {
  useRealtimeDragProp,
  type RealtimeDragProps,
} from '@renderer/hooks/react/useRealtimeDragProp'

void React

describe('useRealtimeDragProp', () => {
  it('does not preview before a drag starts', () => {
    const onPreview = vi.fn()
    const handle = makeRenderHook(() =>
      useRealtimeDragProp({ committed: 0.2, realtime: true, onPreview, onCommit: vi.fn() }),
    )
    act(() => handle.result.onChange(0.3))
    expect(onPreview).not.toHaveBeenCalled()
    expect(handle.result.value).toBe(0.3)
  })

  it('previews each frame while dragging and commits one step anchored on the pre-drag value', () => {
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    const handle = makeRenderHook(() =>
      useRealtimeDragProp({ committed: 0.2, realtime: true, onPreview, onCommit }),
    )
    act(() => handle.result.onDragStart())
    act(() => handle.result.onChange(0.4))
    expect(onPreview).toHaveBeenCalledWith(0.4)

    act(() => handle.result.onRelease(0.6))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(0.2, 0.6, false)
  })

  it('rolls the draft back to the original and aborts on cancel', () => {
    const onAbort = vi.fn()
    const handle = makeRenderHook(() =>
      useRealtimeDragProp({
        committed: 0.2,
        realtime: true,
        onPreview: vi.fn(),
        onCommit: vi.fn(),
        onAbort,
      }),
    )
    act(() => handle.result.onDragStart())
    act(() => handle.result.onChange(0.4))
    expect(handle.result.value).toBe(0.4)

    act(() => handle.result.onDragCancel())
    expect(onAbort).toHaveBeenCalledWith(0.2, false)
    expect(handle.result.value).toBe(0.2)
  })

  it('rolls the draft back without a write when the drag was not realtime', () => {
    // Nothing was previewed, so the object never left `original`: writing it
    // back is a worker round trip that changes nothing. Only the field's own
    // draft has to be restored.
    const onAbort = vi.fn()
    const handle = makeRenderHook(() =>
      useRealtimeDragProp({
        committed: 0.2,
        realtime: false,
        onPreview: vi.fn(),
        onCommit: vi.fn(),
        onAbort,
      }),
    )
    act(() => handle.result.onDragStart())
    act(() => handle.result.onChange(0.4))
    expect(handle.result.value).toBe(0.4)

    act(() => handle.result.onDragCancel())
    expect(onAbort).not.toHaveBeenCalled()
    expect(handle.result.value).toBe(0.2)
  })

  it('anchors a non-drag commit (arrow / text) on the current committed value', () => {
    const onCommit = vi.fn()
    const handle = makeRenderHook(() =>
      useRealtimeDragProp({ committed: 0.2, realtime: true, onPreview: vi.fn(), onCommit }),
    )
    // No onDragStart: arrow click / text edit path.
    act(() => handle.result.onRelease(0.5))
    expect(onCommit).toHaveBeenCalledWith(0.2, 0.5, false)
  })

  it('tracks the committed value while idle but freezes the draft mid-drag', () => {
    // A fresh element per render (new props) is needed so React actually
    // re-renders; makeRenderHook reuses one element and would bail out.
    let captured!: RealtimeDragProps
    const Probe: React.FC<{ committed: number }> = ({ committed }) => {
      captured = useRealtimeDragProp({
        committed,
        realtime: true,
        onPreview: vi.fn(),
        onCommit: vi.fn(),
      })
      return null
    }
    const container = document.createElement('div')
    const root = createRoot(container)
    const render = (committed: number) =>
      act(() => root.render(React.createElement(Probe, { committed })))

    render(0.2)
    expect(captured.value).toBe(0.2)

    // Idle external change -> draft follows.
    render(0.9)
    expect(captured.value).toBe(0.9)

    // Mid-drag external change (e.g. a debounced refetch of a preview) -> the
    // draft is left alone so the user's drag value is not clobbered.
    act(() => captured.onDragStart())
    act(() => captured.onChange(0.4))
    render(0.1)
    expect(captured.value).toBe(0.4)

    act(() => root.unmount())
  })

  it('freezes the default flag at drag start so a mid-drag refetch cannot change it', () => {
    // A preview frame flips the prop to non-default and a debounced refetch can
    // report isdefault=false mid-drag; the commit must still see the pre-drag
    // flag. Freeze it the same way the draft value is frozen.
    const onCommit = vi.fn()
    let captured!: RealtimeDragProps
    const Probe: React.FC<{ committedIsDefault: boolean }> = ({ committedIsDefault }) => {
      captured = useRealtimeDragProp({
        committed: 0.2,
        committedIsDefault,
        realtime: true,
        onPreview: vi.fn(),
        onCommit,
      })
      return null
    }
    const container = document.createElement('div')
    const root = createRoot(container)
    const render = (committedIsDefault: boolean) =>
      act(() => root.render(React.createElement(Probe, { committedIsDefault })))

    render(true)
    act(() => captured.onDragStart())
    // Mid-drag refetch reports the flipped (non-default) flag.
    render(false)
    act(() => captured.onRelease(0.6))
    expect(onCommit).toHaveBeenCalledWith(0.2, 0.6, true)

    act(() => root.unmount())
  })
})
