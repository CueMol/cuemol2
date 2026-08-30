/**
 * Pin streamLoadDensityMap service: reader configuration per
 * (readerName, mapType), normal/cancel/HTTP-error paths, and
 * post-load setup (preset contour count + fitView).
 *
 * UXP reference:
 *  - reader props: netpdbopen.js openMapImpl L334-360 (compress, clmn_F/PHI, gridsize)
 *  - renderer setup: renderer.js doSetupRend density-map branch
 *  - cancel cleanup: forceCancel L102-117 (waitLoadAsync drains on every exit path)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/setupDensityMapRenderers', () => ({
    setupDensityMapRenderers: vi.fn(),
}))
vi.mock('@renderer/worker/server/services/withUndoTxn', () => ({
    withUndoTxn: vi.fn((_scene: unknown, _label: string, fn: () => unknown) => fn()),
    // The Result-returning variant: commit on ok, roll back otherwise. The
    // fixture only needs the body to run, so pass it straight through.
    undoTxnResult: (_s: unknown, _l: string, fn: () => unknown) => fn(),
}))

import { services } from '@renderer/worker/server/services/streamLoadDensityMap.service'
import { setupDensityMapRenderers } from '@renderer/worker/server/services/helpers/setupDensityMapRenderers'

const { streamLoadDensityMap } = services

interface FakeReader {
    __reader: true;
    name: string;
    compress?: string;
    clmn_F?: string;
    clmn_PHI?: string;
    gridsize?: number;
}

interface FakeObj {
    __obj: true;
    name?: string;
    fitView: ReturnType<typeof vi.fn>;
}

interface MockEnv {
    ctx: WorkerContext;
    reader: FakeReader;
    obj: FakeObj;
    scene: { uid: number; addObject: ReturnType<typeof vi.fn> };
    view: { __view: true };
    createHandler: ReturnType<typeof vi.fn>;
    loadObjectAsync: ReturnType<typeof vi.fn>;
    supplyDataAsync: ReturnType<typeof vi.fn>;
    waitLoadAsync: ReturnType<typeof vi.fn>;
    fromTypedArray: ReturnType<typeof vi.fn>;
    postMessageMock: ReturnType<typeof vi.fn>;
}

function makeEnv(opts?: { readerName?: string; obj?: FakeObj | null }): MockEnv {
    const reader: FakeReader = { __reader: true, name: opts?.readerName ?? 'mmcifmap' }
    const obj: FakeObj = opts?.obj === undefined
        ? { __obj: true, fitView: vi.fn() }
        : (opts.obj as FakeObj)
    const scene = { uid: 7, addObject: vi.fn() }
    const view = { __view: true } as const

    const createHandler = vi.fn(() => reader)
    const loadObjectAsync = vi.fn(() => 99)
    const supplyDataAsync = vi.fn()
    const waitLoadAsync = vi.fn(() => obj)
    const fromTypedArray = vi.fn((u: Uint8Array) => ({ __ba: true, len: u.byteLength }))

    const ctx = {
        svc: { fromTypedArray },
        sceMgr: { getScene: vi.fn(() => scene), getView: vi.fn(() => view) },
        strMgr: { createHandler, loadObjectAsync, supplyDataAsync, waitLoadAsync },
    } as unknown as WorkerContext

    const postMessageMock = vi.fn()
    ;(globalThis as unknown as { postMessage: typeof postMessageMock }).postMessage = postMessageMock

    return {
        ctx, reader, obj, scene, view,
        createHandler, loadObjectAsync, supplyDataAsync, waitLoadAsync,
        fromTypedArray, postMessageMock,
    }
}

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
        return { ok: true, status: 200, body: stream } as unknown as Response
    })
}

describe('streamLoadDensityMap — reader configuration', () => {
    let originalFetch: typeof fetch | undefined
    beforeEach(() => {
        vi.clearAllMocks()
        originalFetch = globalThis.fetch
    })
    afterEach(() => {
        if (originalFetch) globalThis.fetch = originalFetch
        else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    })

    it('mmcifmap + gzip: sets compress="gzip" and gridsize=0.25; does NOT set MTZ columns', async () => {
        const env = makeEnv({ readerName: 'mmcifmap' })
        globalThis.fetch = fetchYieldingChunks([new Uint8Array([1, 2, 3])]) as unknown as typeof fetch

        await streamLoadDensityMap(env.ctx, {
            reqId: 'r-1',
            url: 'https://files.rcsb.org/.../1mbn_validation_2fo-fc_map_coef.cif.gz',
            readerName: 'mmcifmap',
            gzip: true,
            mapType: '2fofc',
            objectName: '1mbn_2fofc',
            sceneId: 7,
            viewId: 1,
        })

        expect(env.createHandler).toHaveBeenCalledWith('mmcifmap', 0)
        expect(env.reader.compress).toBe('gzip')
        expect(env.reader.gridsize).toBe(0.25)
        expect(env.reader.clmn_F).toBeUndefined()
        expect(env.reader.clmn_PHI).toBeUndefined()
    })

    it('mtzmap + 2fofc: sets clmn_F=FWT, clmn_PHI=PHWT, gridsize=0.25; does NOT set compress', async () => {
        const env = makeEnv({ readerName: 'mtzmap' })
        globalThis.fetch = fetchYieldingChunks([new Uint8Array([1, 2])]) as unknown as typeof fetch

        await streamLoadDensityMap(env.ctx, {
            reqId: 'r-2',
            url: 'https://www.ebi.ac.uk/pdbe/coordinates/files/1mbn_map.mtz',
            readerName: 'mtzmap',
            gzip: false,
            mapType: '2fofc',
            objectName: '1mbn_2fofc',
            sceneId: 7,
            viewId: 1,
        })

        expect(env.createHandler).toHaveBeenCalledWith('mtzmap', 0)
        expect(env.reader.clmn_F).toBe('FWT')
        expect(env.reader.clmn_PHI).toBe('PHWT')
        expect(env.reader.gridsize).toBe(0.25)
        expect(env.reader.compress).toBeUndefined()
    })

    it('mtzmap + fofc: sets clmn_F=DELFWT, clmn_PHI=PHDELWT', async () => {
        const env = makeEnv({ readerName: 'mtzmap' })
        globalThis.fetch = fetchYieldingChunks([new Uint8Array([1])]) as unknown as typeof fetch

        await streamLoadDensityMap(env.ctx, {
            reqId: 'r-3',
            url: 'https://www.ebi.ac.uk/.../1mbn_map.mtz',
            readerName: 'mtzmap',
            gzip: false,
            mapType: 'fofc',
            objectName: '1mbn_fofc',
            sceneId: 7,
            viewId: 1,
        })

        expect(env.reader.clmn_F).toBe('DELFWT')
        expect(env.reader.clmn_PHI).toBe('PHDELWT')
    })
})

describe('streamLoadDensityMap — post-load behavior', () => {
    let originalFetch: typeof fetch | undefined
    beforeEach(() => {
        vi.clearAllMocks()
        originalFetch = globalThis.fetch
    })
    afterEach(() => {
        if (originalFetch) globalThis.fetch = originalFetch
        else delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    })

    it('success: addObject + setupDensityMapRenderers + fitView; returns ok=true', async () => {
        const env = makeEnv()
        globalThis.fetch = fetchYieldingChunks([
            new Uint8Array([1, 2, 3, 4]),
            new Uint8Array([5, 6, 7]),
        ]) as unknown as typeof fetch

        const result = await streamLoadDensityMap(env.ctx, {
            reqId: 'r-ok',
            url: 'http://x',
            readerName: 'mmcifmap',
            gzip: true,
            mapType: '2fofc',
            objectName: '1mbn_2fofc',
            sceneId: 7,
            viewId: 1,
        })

        expect(env.supplyDataAsync).toHaveBeenCalledTimes(2)
        // stream-progress posts cumulative bytes per chunk
        const progressCalls = env.postMessageMock.mock.calls.filter((c) => c[0]?.[0] === 'stream-progress')
        expect(progressCalls).toHaveLength(2)
        expect(progressCalls[0][0]).toEqual(['stream-progress', 'r-ok', 4])
        expect(progressCalls[1][0]).toEqual(['stream-progress', 'r-ok', 7])

        expect(env.waitLoadAsync).toHaveBeenCalledWith(99)
        expect(env.scene.addObject).toHaveBeenCalledWith(env.obj)
        expect(env.obj.name).toBe('1mbn_2fofc')

        expect(setupDensityMapRenderers).toHaveBeenCalledTimes(1)
        expect(setupDensityMapRenderers).toHaveBeenCalledWith(env.ctx, env.scene, env.obj, '2fofc')

        expect(env.obj.fitView).toHaveBeenCalledWith(env.view, false)
        expect(result).toEqual(expect.objectContaining({ ok: true }))
    })

    it('cancel: drains IOThread, does NOT call addObject / setupDensityMapRenderers / fitView', async () => {
        const env = makeEnv()
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

        // streamLoadFromUrl + streamLoadDensityMap share the same activeReqs
        // map (helpers/streamFetchToReader); cancelStreamLoad service routes
        // through cancelStream(reqId).
        const { services: streamLoadServices } = await import(
            '@renderer/worker/server/services/streamLoadFromUrl.service'
        )
        const { cancelStreamLoad } = streamLoadServices

        const reqId = 'r-cancel'
        const promise = streamLoadDensityMap(env.ctx, {
            reqId,
            url: 'http://x',
            readerName: 'mmcifmap',
            gzip: true,
            mapType: '2fofc',
            objectName: '1mbn_2fofc',
            sceneId: 7,
            viewId: 1,
        })

        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        cancelStreamLoad(env.ctx, { reqId })

        const result = await promise
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'canceled' }))
        expect(env.waitLoadAsync).toHaveBeenCalledWith(99)
        expect(env.scene.addObject).not.toHaveBeenCalled()
        expect(setupDensityMapRenderers).not.toHaveBeenCalled()
        expect(env.obj.fitView).not.toHaveBeenCalled()
    })

    it('HTTP error: drains IOThread, returns an io failure, no scene mutation', async () => {
        const env = makeEnv()
        globalThis.fetch = vi.fn(async () => ({
            ok: false, status: 404, body: null,
        } as unknown as Response)) as unknown as typeof fetch

        const result = await streamLoadDensityMap(env.ctx, {
            reqId: 'r-404',
            url: 'http://x',
            readerName: 'mmcifmap',
            gzip: true,
            mapType: '2fofc',
            objectName: '1mbn_2fofc',
            sceneId: 7,
            viewId: 1,
        })
        expect(result).toEqual(expect.objectContaining({
            ok: false, code: 'io', error: expect.stringMatching(/HTTP 404/),
        }))

        expect(env.waitLoadAsync).toHaveBeenCalledWith(99)
        expect(env.scene.addObject).not.toHaveBeenCalled()
        expect(setupDensityMapRenderers).not.toHaveBeenCalled()
        expect(env.obj.fitView).not.toHaveBeenCalled()
    })
})
