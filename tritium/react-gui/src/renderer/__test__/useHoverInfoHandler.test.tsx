/**
 * useHoverInfoHandler contract: the observable call sequence of the hover
 * controller -- one request in flight, the latest position wins, no request
 * while a button is held, stale replies are dropped, and the setter is only
 * called when the text changes.
 */
import React, { useRef } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'
import { mountTree, flushPromises } from './helpers/testHarness'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const invokeService = vi.fn()
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: { invokeService } }),
}))
vi.mock('@renderer/state/workspace', () => ({
    useActiveScene: () => ({ activeMolViewId: 7, activeSceneId: 100 }),
}))
const pickingPrefs = { gpuPicking: true, hoverInfo: true, hoverHighlight: true, setPickingPref: () => undefined }
vi.mock('@renderer/contexts/PickingPrefsContext', () => ({
    usePickingPrefs: () => pickingPrefs,
}))

import { useHoverInfoHandler } from '@renderer/features/molview/useHoverInfoHandler'
import type { HoverLabel } from '@renderer/features/molview/useHoverInfoHandler'
import { withHoverHold } from '@renderer/features/molview/hoverHold'

const LABEL_M: HoverLabel = { objName: '1CRN', rendName: 'cartoon1', rendType: 'cartoon', residueLevel: true, chain: 'A', resName: 'ALA', resIndex: '10' }

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ setter }: { setter: (m: HoverLabel | null) => void }) {
    const ref = useRef<HTMLDivElement>(null)
    useHoverInfoHandler({ containerRef: ref, setHoverLabel: setter })
    return (
        <div ref={ref}>
            <canvas data-molview-canvas="" />
        </div>
    )
}

type Deferred = { resolve: (v: unknown) => void }

afterEach(() => {
    vi.restoreAllMocks()
    invokeService.mockReset()
})

describe('useHoverInfoHandler', () => {
    it('throttles to one in-flight request, latest position wins, no hover while dragging', async () => {
        const pending: Deferred[] = []
        invokeService.mockImplementation(() => new Promise((resolve) => { pending.push({ resolve }) }))
        const setter = vi.fn()

        const { container, unmount } = mountTree(<Probe setter={setter} />)
        const canvas = container.querySelector('canvas') as HTMLCanvasElement
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect

        // Deterministic throttle: every follow-up waits on a captured timer.
        let timerCb: (() => void) | null = null
        vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => { timerCb = cb; return 0 }) as any)
        vi.spyOn(Date, 'now').mockReturnValue(1000)

        const move = (x: number, y: number, buttons = 0) =>
            act(() => {
                canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, buttons, bubbles: true }))
            })

        // First move issues immediately; the highlight preference rides on the request.
        await move(10, 10)
        expect(invokeService).toHaveBeenCalledTimes(1)
        expect(invokeService).toHaveBeenLastCalledWith('naviHover', { viewId: 7, x: 10, y: 10, highlight: true }, { quiet: true })

        // Moves while a request is pending do not issue; the latest is remembered.
        await move(20, 20)
        await move(30, 30)
        expect(invokeService).toHaveBeenCalledTimes(1)

        await act(async () => { pending[0].resolve({ hit: true, label: LABEL_M }); await flushPromises() })
        expect(setter).toHaveBeenCalledTimes(1)
        expect(setter).toHaveBeenLastCalledWith(LABEL_M)

        // The follow-up is throttled onto the timer and carries only the latest position.
        expect(invokeService).toHaveBeenCalledTimes(1)
        expect(timerCb).not.toBeNull()
        await act(async () => { timerCb!() })
        expect(invokeService).toHaveBeenCalledTimes(2)
        expect(invokeService).toHaveBeenLastCalledWith('naviHover', { viewId: 7, x: 30, y: 30, highlight: true }, { quiet: true })

        // A move with a button held clears the line: no hover request, and one
        // highlight clear for the hit shown (the worker handles it after the
        // hover request still in flight).
        await move(40, 40, 1)
        expect(invokeService).toHaveBeenCalledTimes(3)
        expect(invokeService).toHaveBeenLastCalledWith('naviHoverClear', { viewId: 7 }, { quiet: true })
        expect(setter).toHaveBeenLastCalledWith(null)

        // The reply of the second (now stale) request is dropped.
        await act(async () => { pending[1].resolve({ hit: true, label: { ...LABEL_M, resIndex: '11' } }); await flushPromises() })
        expect(setter).toHaveBeenCalledTimes(2)

        // Leaving the pane repeats neither the null nor the highlight clear.
        await act(() => { container.firstElementChild!.dispatchEvent(new MouseEvent('mouseleave')) })
        expect(setter).toHaveBeenCalledTimes(2)
        expect(invokeService).toHaveBeenCalledTimes(3)

        expect(setter.mock.calls).toEqual([[LABEL_M], [null]])
        unmount()
    })

    it('a right press and the context menu hold keep the hit; the release resyncs', async () => {
        invokeService.mockImplementation((method: string) =>
            Promise.resolve(method === 'naviHover' ? { hit: true, label: LABEL_M } : { ok: true }),
        )
        const setter = vi.fn()

        const { container, unmount } = mountTree(<Probe setter={setter} />)
        const canvas = container.querySelector('canvas') as HTMLCanvasElement
        canvas.getBoundingClientRect = () =>
            ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect

        let timerCb: (() => void) | null = null
        vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => { timerCb = cb; return 0 }) as any)
        vi.spyOn(Date, 'now').mockReturnValue(1000)

        const move = (x: number, y: number) =>
            act(async () => {
                canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, buttons: 0, bubbles: true }))
                await flushPromises()
            })
        const press = (button: number) =>
            act(async () => {
                canvas.dispatchEvent(new MouseEvent('mousedown', { button, buttons: button === 2 ? 2 : 1, bubbles: true }))
                await flushPromises()
            })

        await move(10, 10)
        expect(setter).toHaveBeenLastCalledWith(LABEL_M)
        invokeService.mockClear()

        // The right press is the context-menu gesture, not a drag: no clear.
        await press(2)
        expect(invokeService).not.toHaveBeenCalled()

        // While the menu is up the pointer is recorded but neither sampled nor
        // cleared, so the label and the view highlight stay as the menu found them.
        let closeMenu: () => void = () => undefined
        const held = withHoverHold(() => new Promise<void>((resolve) => { closeMenu = resolve }))
        await move(12, 12)
        expect(invokeService).not.toHaveBeenCalled()
        expect(setter).toHaveBeenCalledTimes(1)

        // Menu resolved (item picked or dismissed): resample where the pointer is.
        await act(async () => { closeMenu(); await held; await flushPromises() })
        expect(timerCb).not.toBeNull()
        await act(async () => { timerCb!(); await flushPromises() })
        expect(invokeService).toHaveBeenCalledTimes(1)
        expect(invokeService).toHaveBeenLastCalledWith('naviHover', { viewId: 7, x: 12, y: 12, highlight: true }, { quiet: true })

        // A left press still ends the hover (a navigation drag follows).
        invokeService.mockClear()
        await press(0)
        expect(invokeService).toHaveBeenCalledTimes(1)
        expect(invokeService).toHaveBeenLastCalledWith('naviHoverClear', { viewId: 7 }, { quiet: true })
        expect(setter).toHaveBeenLastCalledWith(null)

        unmount()
    })

    it('does not sample the pointer at all while the Hover Info preference is off', async () => {
        pickingPrefs.hoverInfo = false
        try {
            const setter = vi.fn()
            const { container, unmount } = mountTree(<Probe setter={setter} />)
            const canvas = container.querySelector('canvas') as HTMLCanvasElement
            canvas.getBoundingClientRect = () =>
                ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect
            await act(() => {
                canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, buttons: 0, bubbles: true }))
            })
            expect(invokeService).not.toHaveBeenCalled()
            expect(setter).not.toHaveBeenCalled()
            unmount()
        } finally {
            pickingPrefs.hoverInfo = true
        }
    })
})
