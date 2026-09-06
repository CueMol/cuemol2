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

import { useHoverInfoHandler } from '@renderer/features/molview/useHoverInfoHandler'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function Probe({ setter }: { setter: (m: string | null) => void }) {
    const ref = useRef<HTMLDivElement>(null)
    useHoverInfoHandler({ containerRef: ref, setHoverMessage: setter })
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

        // First move issues immediately.
        await move(10, 10)
        expect(invokeService).toHaveBeenCalledTimes(1)
        expect(invokeService).toHaveBeenLastCalledWith('naviHover', { viewId: 7, x: 10, y: 10 }, { quiet: true })

        // Moves while a request is pending do not issue; the latest is remembered.
        await move(20, 20)
        await move(30, 30)
        expect(invokeService).toHaveBeenCalledTimes(1)

        await act(async () => { pending[0].resolve({ hit: true, message: 'M' }); await flushPromises() })
        expect(setter).toHaveBeenCalledTimes(1)
        expect(setter).toHaveBeenLastCalledWith('M')

        // The follow-up is throttled onto the timer and carries only the latest position.
        expect(invokeService).toHaveBeenCalledTimes(1)
        expect(timerCb).not.toBeNull()
        await act(async () => { timerCb!() })
        expect(invokeService).toHaveBeenCalledTimes(2)
        expect(invokeService).toHaveBeenLastCalledWith('naviHover', { viewId: 7, x: 30, y: 30 }, { quiet: true })

        // A move with a button held clears the line and issues nothing.
        await move(40, 40, 1)
        expect(invokeService).toHaveBeenCalledTimes(2)
        expect(setter).toHaveBeenLastCalledWith(null)

        // The reply of the second (now stale) request is dropped.
        await act(async () => { pending[1].resolve({ hit: true, message: 'LATE' }); await flushPromises() })
        expect(setter).toHaveBeenCalledTimes(2)

        // Leaving the pane does not repeat an identical null.
        await act(() => { container.firstElementChild!.dispatchEvent(new MouseEvent('mouseleave')) })
        expect(setter).toHaveBeenCalledTimes(2)

        expect(setter.mock.calls).toEqual([['M'], [null]])
        unmount()
    })
})
