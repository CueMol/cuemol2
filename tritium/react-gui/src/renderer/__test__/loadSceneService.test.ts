/**
 * Degrade-detection tests for `loadScene` (worker service).
 *
 * Pins the new direct-API contract (after we replaced `LoadSceneCommand`
 * with direct StreamManager + SceneXMLReader calls):
 *
 *   - reader name is guessed from extension via `strMgr.getInfoJSON2()`
 *     (category 3 = SCEREADER)
 *   - reader.setPath / attach(scene) / read / detach happen in that order
 *   - scene.loadViewFromCam("__current") is invoked for every view in
 *     scene.view_uids (mirrors `m_bSetCamera=true` block of
 *     LoadSceneCommand::run)
 *   - reader.detach is called even when reader.read throws (try/finally)
 *   - the whole flow runs inside startUndoTxn("Open scene") /
 *     commitUndoTxn (rollback on throw)
 *   - `ctx.cmdMgr.getCmd('load_scene')` MUST NOT be invoked -- the
 *     regression tripwire for re-introducing the cmd.target_scene = scene
 *     setter that corrupted scene.m_thisname and broke undo.
 */

import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/loadScene.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

const { loadScene } = services

const SCEREADER_CATEGORY = 3

function makeFixture(opts: {
    infoJson?: string
    viewUids?: string
    readerCreateFails?: boolean
    readFn?: () => void
} = {}) {
    const calls: string[] = []
    const infoJson = opts.infoJson ?? JSON.stringify([
        { name: 'qsc_xml', fext: '*.qsc', category: SCEREADER_CATEGORY },
    ])

    const reader = {
        setPath: vi.fn((p: string) => calls.push(`setPath(${p})`)),
        attach: vi.fn((s: unknown) => calls.push(`attach(${s ? 'scene' : 'null'})`)),
        read: vi.fn(opts.readFn ?? (() => calls.push('read'))),
        detach: vi.fn(() => calls.push('detach')),
    }

    const scene = {
        view_uids: opts.viewUids ?? '',
        getView: vi.fn((uid: number) => ({ _uid: uid })),
        loadViewFromCam: vi.fn((uid: number, name: string) =>
            calls.push(`loadViewFromCam(${uid},${name})`)),
        startUndoTxn: vi.fn((label: string) => calls.push(`start:${label}`)),
        commitUndoTxn: vi.fn(() => calls.push('commit')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollback')),
    }

    const getCmd = vi.fn(() => {
        throw new Error('getCmd should NOT be called in the direct-API path')
    })

    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        cmdMgr: { getCmd },
        strMgr: {
            getInfoJSON2: vi.fn(() => infoJson),
            createHandler: vi.fn((_n: string, _c: number) =>
                opts.readerCreateFails ? null : reader),
        },
    } as unknown as WorkerContext

    return { ctx, scene, reader, calls, getCmd }
}

describe('loadScene.service — direct API', () => {
    it('runs reader.setPath -> attach -> read -> detach -> loadViewFromCam, inside undo txn', () => {
        const { ctx, calls } = makeFixture({ viewUids: '10, 11' })
        const result = loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(result).toEqual({ ok: true })
        expect(calls).toEqual([
            'start:Open scene',
            'setPath(/test.qsc)',
            'attach(scene)',
            'read',
            'detach',
            'loadViewFromCam(10,__current)',
            'loadViewFromCam(11,__current)',
            'commit',
        ])
    })

    it('never calls ctx.cmdMgr.getCmd("load_scene") (no LoadSceneCommand path)', () => {
        const { ctx, getCmd } = makeFixture()
        loadScene(ctx, { filePath: '/x.qsc', sceneId: 1 })
        expect(getCmd).not.toHaveBeenCalled()
    })

    it('returns ok:false and rolls back when no SCEREADER matches the extension', () => {
        const { ctx, calls } = makeFixture({
            infoJson: JSON.stringify([
                { name: 'qsc_xml', fext: '*.qsc', category: SCEREADER_CATEGORY },
            ]),
        })
        const result = loadScene(ctx, { filePath: '/test.txt', sceneId: 1 })
        expect(result).toEqual({ ok: false })
        // Undo txn still commits with ok:false (we only roll back on throw,
        // which matches the existing withUndoTxn semantics).
        expect(calls).toContain('start:Open scene')
        expect(calls).toContain('commit')
    })

    it('returns ok:false when createHandler returns null', () => {
        const { ctx } = makeFixture({ readerCreateFails: true })
        const result = loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(result).toEqual({ ok: false })
    })

    it('still calls detach when read throws, and propagates via rollback', () => {
        const { ctx, reader, calls } = makeFixture({
            viewUids: '10',
            readFn: () => { calls.push('read'); throw new Error('parse fail') },
        })
        expect(() => loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })).toThrow('parse fail')
        expect(reader.detach).toHaveBeenCalled()
        // Undo txn must roll back, not commit.
        expect(calls).toContain('rollback')
        expect(calls).not.toContain('commit')
    })

    it('skips loadViewFromCam when view_uids is empty', () => {
        const { ctx, scene } = makeFixture({ viewUids: '' })
        loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(scene.loadViewFromCam).not.toHaveBeenCalled()
    })
})
