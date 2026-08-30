import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useMolViewTabTitleSync } from '@renderer/hooks/useMolViewTabTitleSync'
import { SEM_SCENE, SEM_PROPCHG, SEM_ANY } from '@renderer/event'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

interface MountResult {
  cm: {
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
    invokeService: ReturnType<typeof vi.fn>
  }
  updateMolViewTabTitle: ReturnType<typeof vi.fn>
  fireEvent: (args: unknown) => void
  unmount: () => void
}

function mountSync(opts: {
  molTabEntries: { view_id: number; scene_uid: number }[]
  /** title returned by getViewTabLabel keyed by viewId; missing => ok:false */
  titles: Record<number, string>
}): MountResult {
  let storedFire: ((args: unknown) => void) | null = null

  const addEventListener = vi.fn(
    (_cat: string, _src: number, _evt: number, _scope: number, fire: (args: unknown) => void) => {
      storedFire = fire
      return Promise.resolve(1)
    },
  )
  const removeEventListener = vi.fn(() => Promise.resolve())
  const invokeService = vi.fn((name: string, args: { viewId: number }) => {
    void name
    const title = opts.titles[args.viewId]
    return Promise.resolve(
      title !== undefined
        ? { ok: true, title, sceneId: 0 }
        : { ok: false, title: '', sceneId: -1 },
    )
  })
  const cm = { addEventListener, removeEventListener, invokeService } as any
  const updateMolViewTabTitle = vi.fn()

  const container = document.createElement('div')
  document.body.appendChild(container)
  let root!: Root

  const Probe: React.FC = () => {
    useMolViewTabTitleSync({ cm, molTabEntries: opts.molTabEntries, updateMolViewTabTitle })
    return null
  }

  act(() => {
    root = createRoot(container)
    root.render(React.createElement(Probe))
  })

  return {
    cm,
    updateMolViewTabTitle,
    fireEvent: (args: unknown) => storedFire?.(args),
    unmount: () => {
      act(() => { root.unmount() })
      document.body.removeChild(container)
    },
  }
}

async function flushPromises(): Promise<void> {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

describe('useMolViewTabTitleSync', () => {
  beforeEach(() => { vi.useRealTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('subscribes for scene name PROPCHG across any scene', async () => {
    const m = mountSync({ molTabEntries: [], titles: {} })
    await flushPromises()
    expect(m.cm.addEventListener).toHaveBeenCalledTimes(1)
    const [, src, evt, scope] = m.cm.addEventListener.mock.calls[0]
    expect(src).toBe(SEM_SCENE)
    expect(evt).toBe(SEM_PROPCHG)
    expect(scope).toBe(SEM_ANY)
    m.unmount()
  })

  it('refetches and updates the title for tabs of the renamed scene', async () => {
    const m = mountSync({
      molTabEntries: [
        { view_id: 10, scene_uid: 1 },
        { view_id: 11, scene_uid: 1 },
        { view_id: 20, scene_uid: 2 },
      ],
      titles: { 10: 'NewName:0', 11: 'NewName:1' },
    })
    await flushPromises()

    m.fireEvent({ srcUID: 1, obj: { propname: 'name' } })
    await flushPromises()

    // Only scene 1's two views are refetched (not scene 2's view 20).
    const refetched = m.cm.invokeService.mock.calls
      .filter((c) => c[0] === 'getViewTabLabel')
      .map((c) => c[1].viewId)
      .sort((a: number, b: number) => a - b)
    expect(refetched).toEqual([10, 11])

    expect(m.updateMolViewTabTitle).toHaveBeenCalledWith(10, 'NewName:0')
    expect(m.updateMolViewTabTitle).toHaveBeenCalledWith(11, 'NewName:1')
    expect(m.updateMolViewTabTitle).toHaveBeenCalledTimes(2)
    m.unmount()
  })

  it('ignores PROPCHG events whose propname is not "name"', async () => {
    const m = mountSync({
      molTabEntries: [{ view_id: 10, scene_uid: 1 }],
      titles: { 10: 'X:0' },
    })
    await flushPromises()

    m.fireEvent({ srcUID: 1, obj: { propname: 'visible' } })
    await flushPromises()

    expect(m.cm.invokeService).not.toHaveBeenCalled()
    expect(m.updateMolViewTabTitle).not.toHaveBeenCalled()
    m.unmount()
  })

  it('does nothing when no open tab belongs to the renamed scene', async () => {
    const m = mountSync({
      molTabEntries: [{ view_id: 10, scene_uid: 1 }],
      titles: { 10: 'X:0' },
    })
    await flushPromises()

    m.fireEvent({ srcUID: 99, obj: { propname: 'name' } })
    await flushPromises()

    expect(m.cm.invokeService).not.toHaveBeenCalled()
    expect(m.updateMolViewTabTitle).not.toHaveBeenCalled()
    m.unmount()
  })

  it('does not update the title when the view is gone (ok:false)', async () => {
    const m = mountSync({
      molTabEntries: [{ view_id: 10, scene_uid: 1 }],
      titles: {}, // getViewTabLabel returns ok:false
    })
    await flushPromises()

    m.fireEvent({ srcUID: 1, obj: { propname: 'name' } })
    await flushPromises()

    expect(m.cm.invokeService).toHaveBeenCalledTimes(1)
    expect(m.updateMolViewTabTitle).not.toHaveBeenCalled()
    m.unmount()
  })
})
