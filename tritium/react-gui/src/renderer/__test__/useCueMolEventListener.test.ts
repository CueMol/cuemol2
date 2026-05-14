import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useCueMolEventListener } from '../hooks/useCueMolEventListener'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

interface MountResult {
    cm: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
    handler: ReturnType<typeof vi.fn>
    fireEvent: (args: unknown) => void
    addResolve: (id: number) => void
    unmount: () => void
}

function mountListener(opts: {
    addImmediate?: boolean
    debounceMs?: number
}): MountResult {
    let storedFire: ((args: unknown) => void) | null = null
    let pendingResolve: ((id: number) => void) | null = null

    const addEventListener = vi.fn(
        (cat: string, src: number, evt: number, scope: number, fire: (args: unknown) => void) => {
            void cat; void src; void evt; void scope
            storedFire = fire
            if (opts.addImmediate ?? true) {
                return Promise.resolve(101)
            }
            return new Promise<number>((resolve) => { pendingResolve = resolve })
        },
    )
    const removeEventListener = vi.fn(() => Promise.resolve())
    const cm = { addEventListener, removeEventListener } as any
    const handler = vi.fn()

    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root

    const Probe: React.FC = () => {
        useCueMolEventListener({
            cm,
            category: 'test',
            srcMask: 0xff,
            evtMask: 0x07,
            scopeId: 7,
            handler,
            debounceMs: opts.debounceMs,
        })
        return null
    }

    act(() => {
        root = createRoot(container)
        root.render(React.createElement(Probe))
    })

    return {
        cm,
        handler,
        fireEvent: (args: unknown) => storedFire?.(args),
        addResolve: (id: number) => { pendingResolve?.(id) },
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

describe('useCueMolEventListener', () => {
    beforeEach(() => { vi.useRealTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('subscribes with the supplied filter args on mount', async () => {
        const m = mountListener({})
        await flushPromises()
        expect(m.cm.addEventListener).toHaveBeenCalledTimes(1)
        const [cat, src, evt, scope] = m.cm.addEventListener.mock.calls[0]
        expect(cat).toBe('test')
        expect(src).toBe(0xff)
        expect(evt).toBe(0x07)
        expect(scope).toBe(7)
        m.unmount()
    })

    it('forwards events to the handler when no debounce is set', async () => {
        const m = mountListener({})
        await flushPromises()
        m.fireEvent({ payload: 1 })
        m.fireEvent({ payload: 2 })
        expect(m.handler).toHaveBeenCalledTimes(2)
        expect(m.handler.mock.calls[0][0]).toEqual({ payload: 1 })
        expect(m.handler.mock.calls[1][0]).toEqual({ payload: 2 })
        m.unmount()
    })

    it('removes the listener on unmount with the resolved cbid', async () => {
        const m = mountListener({})
        await flushPromises()
        m.unmount()
        expect(m.cm.removeEventListener).toHaveBeenCalledTimes(1)
        expect(m.cm.removeEventListener.mock.calls[0][0]).toBe(101)
    })

    it('still removes the listener when addEventListener resolves after unmount', async () => {
        const m = mountListener({ addImmediate: false })
        await flushPromises()
        // Unmount BEFORE the addEventListener promise resolves
        m.unmount()
        // Now resolve the in-flight subscription
        m.addResolve(202)
        await flushPromises()
        expect(m.cm.removeEventListener).toHaveBeenCalledTimes(1)
        expect(m.cm.removeEventListener.mock.calls[0][0]).toBe(202)
    })

    it('coalesces events within the debounce window into one handler call', async () => {
        let stored: (() => void) | null = null
        const setSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
            ((cb: () => void) => { stored = cb; return 1 as unknown as ReturnType<typeof setTimeout> }) as typeof setTimeout,
        )
        try {
            const m = mountListener({ debounceMs: 30 })
            await flushPromises()
            m.fireEvent({ n: 1 })
            m.fireEvent({ n: 2 })
            m.fireEvent({ n: 3 })
            expect(m.handler).not.toHaveBeenCalled()
            // Manually fire the timer
            act(() => { stored!() })
            expect(m.handler).toHaveBeenCalledTimes(1)
            m.unmount()
        } finally {
            setSpy.mockRestore()
        }
    })
})
