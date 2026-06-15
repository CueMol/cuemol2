import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { fireService } from '../utils/fireService'

/**
 * Degrade-detection test for fireService -- the fire-and-forget worker-service
 * helper adopted by the mutation panes. Pins the observable policy:
 *   - it forwards (name, args) to cm.invokeService verbatim,
 *   - it does not await or return the promise (fire-and-forget),
 *   - a rejection is reported via console.warn and never throws.
 *
 * The args/name typing is exercised by the call sites; here we use a loose
 * cast on the mock so the test does not depend on any specific ServiceMap row.
 */

type CmStub = Pick<AsyncCueMol, 'invokeService'>

function makeCm(impl: () => Promise<unknown>): CmStub {
    return { invokeService: vi.fn(impl) } as unknown as CmStub
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('fireService', () => {
    it('forwards (name, args) to cm.invokeService', () => {
        const cm = makeCm(() => Promise.resolve({ ok: true }))
        const args = { sceneId: 1, rendId: 2 }
        fireService(cm as unknown as AsyncCueMol, 'showSymmRenderer' as never, args as never)
        expect(cm.invokeService).toHaveBeenCalledTimes(1)
        expect(cm.invokeService).toHaveBeenCalledWith('showSymmRenderer', args)
    })

    it('returns void (fire-and-forget, does not surface the promise)', () => {
        const cm = makeCm(() => Promise.resolve(undefined))
        const ret = fireService(cm as unknown as AsyncCueMol, 'showSymmRenderer' as never, {} as never)
        expect(ret).toBeUndefined()
    })

    it('logs a warning on rejection and does not throw', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const reason = new Error('boom')
        const cm = makeCm(() => Promise.reject(reason))
        expect(() =>
            fireService(cm as unknown as AsyncCueMol, 'showSymmRenderer' as never, {} as never),
        ).not.toThrow()
        // Let the rejected promise settle so the .catch tail runs.
        await Promise.resolve()
        await Promise.resolve()
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toBe('showSymmRenderer failed:')
        expect(warn.mock.calls[0][1]).toBe(reason)
    })
})
