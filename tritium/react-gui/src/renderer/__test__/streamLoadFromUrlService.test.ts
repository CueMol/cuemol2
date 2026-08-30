/**
 * Degrade-detection tests for streamLoadFromUrl / cancelStreamLoad services.
 *
 * Pins the chunk-feed contract that mirrors UXP netpdbopen.js:
 *   - createHandler(readerName, 0) -> ObjReader
 *   - loadObjectAsync(reader) -> tid
 *   - per chunk: fromTypedArray -> supplyDataAsync(tid, ba, len) + 'stream-progress' postMessage
 *   - waitLoadAsync(tid) called on EVERY exit path (success / cancel / error)
 *     [matches UXP forceCancel (netpdbopen.js:107) -- leaving IOThread blocked is a leak]
 *   - cancel: scene.addObject NOT called, setupRenderer NOT called, result.canceled=true
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { FileOpenOptions } from '@renderer/dialogs/fopen-opt-dlgs/types'

vi.mock('@renderer/worker/server/services/rend/setupRenderer', () => ({
    setupRenderer: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/withUndoTxn', () => ({
    withUndoTxn: vi.fn((_scene: unknown, _label: string, fn: () => unknown) => fn()),
    // The Result-returning variant: commit on ok, roll back otherwise. The
    // fixture only needs the body to run, so pass it straight through.
    undoTxnResult: (_s: unknown, _l: string, fn: () => unknown) => fn(),
}))
vi.mock('@renderer/worker/server/services/helpers/applyReaderOptions', () => ({
    applyReaderOptions: vi.fn(),
}))

import { services } from '@renderer/worker/server/services/file/file.service'
import { setupRenderer } from '@renderer/worker/server/services/rend/setupRenderer'
import { applyReaderOptions } from '@renderer/worker/server/services/helpers/applyReaderOptions'

const { streamLoadFromUrl, cancelStreamLoad } = services

interface MockEnv {
    ctx: WorkerContext
    reader: { __reader: true }
    obj: { __obj: true; name?: string } | null
    scene: { addObject: ReturnType<typeof vi.fn> }
    createHandler: ReturnType<typeof vi.fn>
    loadObjectAsync: ReturnType<typeof vi.fn>
    supplyDataAsync: ReturnType<typeof vi.fn>
    waitLoadAsync: ReturnType<typeof vi.fn>
    fromTypedArray: ReturnType<typeof vi.fn>
    postMessageMock: ReturnType<typeof vi.fn>
}

function makeEnv(opts?: { obj?: { __obj: true; name?: string } | null }): MockEnv {
    const reader = { __reader: true } as const
    const obj = opts?.obj === undefined ? { __obj: true } as { __obj: true; name?: string } : opts.obj
    const scene = { addObject: vi.fn() }

    const createHandler = vi.fn(() => reader)
    const loadObjectAsync = vi.fn(() => 42)
    const supplyDataAsync = vi.fn()
    const waitLoadAsync = vi.fn(() => obj)
    const fromTypedArray = vi.fn((u: Uint8Array) => ({ __ba: true, len: u.byteLength }))

    const ctx = {
        svc: { fromTypedArray },
        sceMgr: { getScene: vi.fn(() => scene) },
        strMgr: { createHandler, loadObjectAsync, supplyDataAsync, waitLoadAsync },
    } as unknown as WorkerContext

    const postMessageMock = vi.fn()
    ;(globalThis as unknown as { postMessage: typeof postMessageMock }).postMessage = postMessageMock

    return {
        ctx, reader, obj, scene,
        createHandler, loadObjectAsync, supplyDataAsync, waitLoadAsync,
        fromTypedArray, postMessageMock,
    }
}

function makeOptions(): FileOpenOptions {
    return {
        format: { kind: 'mmcif', options: {
            loadModel: true, loadAnisou: false, loadAltConf: false,
            loadSegid: false, build2ndry: true, autoTopology: false,
        } },
        renderer: {
            objectName: '1mbn',
            rendererType: 'simple',
            rendererName: 'simple1',
            selectionEnabled: false,
            selection: '*',
            centerView: true,
        },
    }
}

/** Build a fetch mock that yields N chunks then completes. */
function fetchYieldingChunks(chunks: Uint8Array[]) {
    return vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        const signal = init?.signal
        let idx = 0
        const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
                if (signal?.aborted) {
                    controller.error(new DOMException('aborted', 'AbortError'))
                    return
                }
                if (idx >= chunks.length) { controller.close(); return }
                controller.enqueue(chunks[idx++])
            },
        })
        return {
            ok: true,
            status: 200,
            body: stream,
        } as unknown as Response
    })
}

describe('streamLoadFromUrl service', () => {
    let originalFetch: typeof fetch | undefined
    beforeEach(() => {
        vi.clearAllMocks()
        originalFetch = globalThis.fetch
    })
    afterEach(() => {
        if (originalFetch) globalThis.fetch = originalFetch
        else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    })

    it('feeds chunks via supplyDataAsync, posts stream-progress, calls scene.addObject + setupRenderer on success', async () => {
        const env = makeEnv()
        const c1 = new Uint8Array([1, 2, 3, 4])
        const c2 = new Uint8Array([5, 6, 7, 8, 9])
        globalThis.fetch = fetchYieldingChunks([c1, c2]) as unknown as typeof fetch

        const result = await streamLoadFromUrl(env.ctx, {
            reqId: 'req-1',
            url: 'https://files.rcsb.org/download/1mbn.cif',
            readerName: 'mmcif',
            objectName: '1mbn',
            sceneId: 7,
            options: makeOptions(),
        })

        expect(env.createHandler).toHaveBeenCalledWith('mmcif', 0)
        // Format options are wired onto the reader before streaming.
        expect(applyReaderOptions).toHaveBeenCalledWith(
            env.reader, 'mmcif', expect.objectContaining({ kind: 'mmcif' }),
        )
        expect(env.loadObjectAsync).toHaveBeenCalledWith(env.reader)
        expect(env.supplyDataAsync).toHaveBeenCalledTimes(2)
        expect(env.supplyDataAsync.mock.calls[0]).toEqual([42, expect.objectContaining({ len: 4 }), 4])
        expect(env.supplyDataAsync.mock.calls[1]).toEqual([42, expect.objectContaining({ len: 5 }), 5])

        // stream-progress: cumulative bytes
        const progressCalls = env.postMessageMock.mock.calls.filter((c) => c[0]?.[0] === 'stream-progress')
        expect(progressCalls).toHaveLength(2)
        expect(progressCalls[0][0]).toEqual(['stream-progress', 'req-1', 4])
        expect(progressCalls[1][0]).toEqual(['stream-progress', 'req-1', 9])

        expect(env.waitLoadAsync).toHaveBeenCalledWith(42)
        expect(env.scene.addObject).toHaveBeenCalledWith(env.obj)
        expect(setupRenderer).toHaveBeenCalledTimes(1)
        expect(result).toEqual(expect.objectContaining({ ok: true }))
    })

    it('cancel path: aborts fetch, drains IOThread via waitLoadAsync, does NOT add to scene', async () => {
        const env = makeEnv()
        const reqId = 'req-cancel'

        // Build a stream that yields one chunk then waits forever (until aborted).
        let pulledOnce = false
        globalThis.fetch = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
            const signal = init?.signal
            const stream = new ReadableStream<Uint8Array>({
                pull(controller) {
                    if (signal?.aborted) {
                        controller.error(new DOMException('aborted', 'AbortError'))
                        return
                    }
                    if (!pulledOnce) {
                        pulledOnce = true
                        controller.enqueue(new Uint8Array([0x41]))
                        return
                    }
                    return new Promise<void>((resolve) => {
                        signal?.addEventListener('abort', () => {
                            controller.error(new DOMException('aborted', 'AbortError'))
                            resolve()
                        })
                    })
                },
            })
            return { ok: true, status: 200, body: stream } as unknown as Response
        }) as unknown as typeof fetch

        const promise = streamLoadFromUrl(env.ctx, {
            reqId,
            url: 'https://files.rcsb.org/download/1mbn.cif',
            readerName: 'mmcif',
            objectName: '1mbn',
            sceneId: 7,
            options: makeOptions(),
        })

        // Yield event loop so the fetch starts and the first chunk is supplied.
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        // Trigger cancel
        const cancelResult = cancelStreamLoad(env.ctx, { reqId })
        expect(cancelResult).toEqual({ ok: true })

        const result = await promise
        // A cancel is an ordinary Fail with a code, not a bespoke flag.
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'canceled' }))

        // IOThread cleanup MUST run on cancel path (matches UXP forceCancel L107).
        expect(env.waitLoadAsync).toHaveBeenCalledWith(42)
        // No scene mutation on cancel.
        expect(env.scene.addObject).not.toHaveBeenCalled()
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('HTTP error: drains IOThread, does NOT add to scene, returns an io failure', async () => {
        const env = makeEnv()
        globalThis.fetch = vi.fn(async () => ({
            ok: false, status: 404, body: null,
        } as unknown as Response)) as unknown as typeof fetch

        // The HTTP error used to escape as a rejected promise -- a different
        // call-site contract from every other failure. It is a Fail now.
        const result = await streamLoadFromUrl(env.ctx, {
            reqId: 'req-404',
            url: 'https://files.rcsb.org/download/9zzz.cif',
            readerName: 'mmcif',
            objectName: '9zzz',
            sceneId: 7,
            options: makeOptions(),
        })
        expect(result).toEqual(expect.objectContaining({
            ok: false, code: 'io', error: expect.stringMatching(/HTTP 404/),
        }))

        // Even on HTTP failure, the IOThread must be drained.
        expect(env.waitLoadAsync).toHaveBeenCalledWith(42)
        expect(env.scene.addObject).not.toHaveBeenCalled()
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('cancelStreamLoad with unknown reqId returns ok=false', () => {
        const env = makeEnv()
        const result = cancelStreamLoad(env.ctx, { reqId: 'never-existed' })
        expect(result).toEqual({ ok: false })
    })
})
