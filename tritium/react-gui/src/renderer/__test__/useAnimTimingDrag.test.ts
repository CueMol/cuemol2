/**
 * @file __test__/useAnimTimingDrag.test.ts
 * @description Pins how `useAnimTimingDrag` turns the Start / Duration fields'
 * single numbers into the `timing` pair the worker writes: the other half
 * comes from the snapshot taken when the gesture began (not from a detail a
 * preview refetch has moved), a gesture is previews then one commit carrying
 * that snapshot as `original`, a cancel is one abort back to it, and a gesture
 * that never announced itself commits against the committed pair.
 */

import { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, makeRenderHook } from '@renderer/__test__/helpers/testHarness'
import { useAnimTimingDrag } from '@renderer/features/inspector/anim/useAnimTimingDrag'
import type { AnimTimingMs } from '@renderer/worker/server/services/anim/anim.service'

function setup(initial: AnimTimingMs | null) {
  let committed = initial
  let resyncKey = 0
  const write = vi.fn(() => Promise.resolve())
  const handle = makeRenderHook(() => useAnimTimingDrag({ committed, write, resyncKey }))
  return {
    handle,
    write,
    setCommitted(c: AnimTimingMs | null) {
      committed = c
      handle.rerender()
    },
    resync() {
      resyncKey += 1
      handle.rerender()
    },
  }
}

const modeOf = (call: unknown[]) => (call[1] as { mode: string }).mode

describe('useAnimTimingDrag', () => {
  it('shows start and duration from the committed pair while idle', () => {
    const { handle, setCommitted } = setup({ startMs: 1000, endMs: 3000 })
    expect(handle.result.start.value).toBe(1000)
    expect(handle.result.duration.value).toBe(2000)
    setCommitted({ startMs: 2000, endMs: 2500 })
    expect(handle.result.start.value).toBe(2000)
    expect(handle.result.duration.value).toBe(500)
    handle.unmount()
  })

  it('a start drag previews from the snapshot and commits once with it as original', async () => {
    const { handle, write, setCommitted } = setup({ startMs: 1000, endMs: 3000 })
    act(() => handle.result.start.onDragStart())
    act(() => handle.result.start.onChange(1500))
    expect(write).toHaveBeenCalledWith(
      { startMs: 1500, endMs: 3500 },
      { mode: 'preview', original: { startMs: 1000, endMs: 3000 } },
    )
    await flushPromises()

    // The timeline's refetch adopts the moved element mid-drag (drifted here
    // on purpose): the draft is left alone and the duration still comes from
    // the snapshot, not from the drifted detail.
    setCommitted({ startMs: 1500, endMs: 3600 })
    expect(handle.result.start.value).toBe(1500)
    act(() => handle.result.start.onChange(2000))
    await flushPromises()
    expect(write).toHaveBeenLastCalledWith(
      { startMs: 2000, endMs: 4000 },
      { mode: 'preview', original: { startMs: 1000, endMs: 3000 } },
    )

    act(() => handle.result.start.onRelease(2000))
    const commits = write.mock.calls.filter((c) => modeOf(c) === 'commit')
    expect(commits).toEqual([
      [{ startMs: 2000, endMs: 4000 }, { mode: 'commit', original: { startMs: 1000, endMs: 3000 } }],
    ])
    handle.unmount()
  })

  it('a duration drag keeps the start (a legacy negative one too) and floors at zero', () => {
    const { handle, write } = setup({ startMs: -500, endMs: 500 })
    act(() => handle.result.duration.onDragStart())
    act(() => handle.result.duration.onChange(2000))
    expect(write).toHaveBeenCalledWith(
      { startMs: -500, endMs: 1500 },
      { mode: 'preview', original: { startMs: -500, endMs: 500 } },
    )
    act(() => handle.result.duration.onRelease(0))
    expect(write).toHaveBeenLastCalledWith(
      { startMs: -500, endMs: -500 },
      { mode: 'commit', original: { startMs: -500, endMs: 500 } },
    )
    handle.unmount()
  })

  it('a cancel is one abort back to the snapshot, and no commit', () => {
    const { handle, write } = setup({ startMs: 1000, endMs: 3000 })
    act(() => handle.result.start.onDragStart())
    act(() => handle.result.start.onChange(1500))
    act(() => handle.result.start.onDragCancel())
    expect(write).toHaveBeenLastCalledWith(
      { startMs: 1000, endMs: 3000 },
      { mode: 'abort', original: { startMs: 1000, endMs: 3000 } },
    )
    expect(write.mock.calls.filter((c) => modeOf(c) === 'commit')).toHaveLength(0)
    expect(handle.result.start.value).toBe(1000)
    handle.unmount()
  })

  it('a release without a drag start commits against the committed pair', () => {
    const { handle, write } = setup({ startMs: 1000, endMs: 3000 })
    act(() => handle.result.start.onRelease(2500))
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(
      { startMs: 2500, endMs: 4500 },
      { mode: 'commit', original: { startMs: 1000, endMs: 3000 } },
    )
    handle.unmount()
  })

  it('a resyncKey change re-seeds both fields from the committed pair after a rejected commit', () => {
    const { handle, resync } = setup({ startMs: 1000, endMs: 3000 })
    act(() => handle.result.start.onChange(2500))
    act(() => handle.result.start.onRelease(2500))
    act(() => handle.result.duration.onChange(100))
    act(() => handle.result.duration.onRelease(100))
    expect(handle.result.start.value).toBe(2500)
    expect(handle.result.duration.value).toBe(100)
    resync()
    expect(handle.result.start.value).toBe(1000)
    expect(handle.result.duration.value).toBe(2000)
    handle.unmount()
  })
})
