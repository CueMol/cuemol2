/**
 * Pin: WorkerTransport routes 'stream-progress' worker→renderer push events
 * to subscribed listeners with the (reqId, bytes) payload, and that
 * unsubscribing stops further calls. Ensures other channels (event-notify,
 * regular RPC reply) are not collateral damage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({
    BaseWrapper: class { constructor() { } },
}))

let capturedWorker: MockWorker | null = null

class MockWorker {
    onmessage: ((ev: MessageEvent) => any) | null = null
    postMessage = vi.fn()
    terminate = vi.fn()
    constructor(_url: any) { capturedWorker = this }
}

import { AsyncCueMol } from '../worker/client/AsyncCueMol'

describe('WorkerTransport — stream-progress push', () => {
    let cm: AsyncCueMol
    beforeEach(() => {
        capturedWorker = null
        vi.stubGlobal('Worker', MockWorker)
        cm = new AsyncCueMol()
    })
    afterEach(() => { vi.unstubAllGlobals() })

    it('forwards (reqId, bytes) to subscribed listeners', () => {
        const cb = vi.fn()
        const unsub = cm.subscribeStreamProgress(cb)

        capturedWorker!.onmessage?.({
            data: ['stream-progress', 'req-A', 1024],
        } as MessageEvent)

        expect(cb).toHaveBeenCalledTimes(1)
        expect(cb).toHaveBeenCalledWith('req-A', 1024)
        unsub()
    })

    it('unsubscribed listener stops receiving events', () => {
        const cb = vi.fn()
        const unsub = cm.subscribeStreamProgress(cb)
        unsub()

        capturedWorker!.onmessage?.({
            data: ['stream-progress', 'req-B', 2048],
        } as MessageEvent)

        expect(cb).not.toHaveBeenCalled()
    })

    it('multiple listeners all receive events', () => {
        const cb1 = vi.fn()
        const cb2 = vi.fn()
        const u1 = cm.subscribeStreamProgress(cb1)
        const u2 = cm.subscribeStreamProgress(cb2)

        capturedWorker!.onmessage?.({
            data: ['stream-progress', 'req-C', 512],
        } as MessageEvent)

        expect(cb1).toHaveBeenCalledWith('req-C', 512)
        expect(cb2).toHaveBeenCalledWith('req-C', 512)
        u1()
        u2()
    })

    it('does not interfere with regular RPC replies', async () => {
        const cb = vi.fn()
        cm.subscribeStreamProgress(cb)

        const promise = cm.invokeWorker('testMethod')
        // Simulate worker reply to the RPC.
        const sent = capturedWorker!.postMessage.mock.calls[0][0] as any[]
        const method = sent[0] as string
        const seqno = sent[1] as number
        capturedWorker!.onmessage?.({
            data: [method, seqno, true, 'ok-result'],
        } as MessageEvent)

        await expect(promise).resolves.toEqual(['ok-result'])
        // The RPC path must not invoke the stream-progress listener.
        expect(cb).not.toHaveBeenCalled()
    })
})
