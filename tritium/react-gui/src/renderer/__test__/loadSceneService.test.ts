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
 *   - the whole flow runs OUTSIDE any undo txn (UXP parity): scene load is
 *     not an edit, so startUndoTxn / commitUndoTxn / rollbackUndoTxn are
 *     never called and the undo stack stays empty after load. (Wrapping the
 *     read in withUndoTxn was the bug -- it captured the object-registration
 *     records and committed a bogus undo entry.)
 *   - `ctx.cmdMgr.getCmd('load_scene')` MUST NOT be invoked -- the
 *     regression tripwire for re-introducing the cmd.target_scene = scene
 *     setter that corrupted scene.m_thisname and broke undo.
 */

import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/loadScene.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

const { loadScene, openSceneFile } = services

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

    const views: number[] = []
    const scene = {
        get view_uids() { return views.length > 0 ? views.join(',') : (opts.viewUids ?? '') },
        uid: 1,
        name: 'Untitled',
        getUID: () => 1,
        createView: vi.fn(() => {
            const uid = 500 + views.length
            views.push(uid)
            calls.push(`createView(${uid})`)
            return { name: '', getUID: () => uid }
        }),
        clearAllData: vi.fn(() => calls.push('clearAllData')),
        getView: vi.fn((uid: number) => ({ _uid: uid })),
        setName: vi.fn((n: string) => { scene.name = n; calls.push(`setName(${n})`) }),
        loadViewFromCam: vi.fn((uid: number, name: string) =>
            calls.push(`loadViewFromCam(${uid},${name})`)),
        startUndoTxn: vi.fn((label: string) => calls.push(`start:${label}`)),
        commitUndoTxn: vi.fn(() => calls.push('commit')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollback')),
    }

    const getCmd = vi.fn(() => {
        throw new Error('getCmd should NOT be called in the direct-API path')
    })

    const createScene = vi.fn(() => {
        calls.push('createScene')
        return scene
    })
    const destroyScene = vi.fn((uid: number) => {
        calls.push(`destroyScene(${uid})`)
        return true
    })
    const addView = vi.fn((viewId: number, dpr: number) => {
        calls.push(`addView(${viewId},${dpr})`)
        return true
    })

    const ctx = {
        svc: { addView },
        sceMgr: { getScene: vi.fn(() => scene), createScene, destroyScene },
        cmdMgr: { getCmd },
        strMgr: {
            getInfoJSON2: vi.fn(() => infoJson),
            createHandler: vi.fn((_n: string, _c: number) =>
                opts.readerCreateFails ? null : reader),
        },
    } as unknown as WorkerContext

    return { ctx, scene, reader, calls, getCmd, createScene, destroyScene, addView }
}

describe('loadScene.service — direct API', () => {
    it('replaces the scene: clearAllData runs before the read (UXP onReloadScene parity)', () => {
        // Reload used to merge the file into the live scene, so every object
        // appeared twice.
        const { ctx, calls } = makeFixture()
        const res = loadScene(ctx, { filePath: '/tmp/a.qsc', sceneId: 1 })
        expect(res.ok).toBe(true)
        expect(calls.indexOf('clearAllData')).toBeGreaterThanOrEqual(0)
        expect(calls.indexOf('clearAllData')).toBeLessThan(calls.indexOf('read'))
    })

    it('clears again when the read fails, so no half-read scene survives', () => {
        const { ctx, scene, calls } = makeFixture({
            readFn: () => { throw new Error('parse fail') },
        })
        const res = loadScene(ctx, { filePath: '/tmp/a.qsc', sceneId: 1 })
        expect(res).toEqual(expect.objectContaining({ ok: false, code: 'io' }))
        expect(scene.clearAllData).toHaveBeenCalledTimes(2)
        expect(calls).toContain('detach')
    })

    it('runs clearAllData -> setPath -> attach -> read -> detach -> setName -> loadViewFromCam, with NO undo txn', () => {
        const { ctx, scene, calls } = makeFixture({ viewUids: '10, 11' })
        const result = loadScene(ctx, { filePath: '/dir/test.qsc', sceneId: 1 })
        expect(result).toEqual({ ok: true })
        expect(calls).toEqual([
            // The scene is emptied first: a scene file replaces the scene.
            'clearAllData',
            'setPath(/dir/test.qsc)',
            'attach(scene)',
            'read',
            'detach',
            'setName(test.qsc)',
            'loadViewFromCam(10,__current)',
            'loadViewFromCam(11,__current)',
        ])
        // Tripwire: scene load must never open an undo txn (UXP parity).
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
    })

    it('sets scene name to the file leaf name WITH extension (UXP getFileLeafName parity)', () => {
        // POSIX path with directories.
        const posix = makeFixture()
        loadScene(posix.ctx, { filePath: '/home/me/proteins/mystruct.qsc', sceneId: 1 })
        expect(posix.scene.setName).toHaveBeenCalledWith('mystruct.qsc')

        // Windows-style separators must also resolve to the leaf.
        const win = makeFixture()
        loadScene(win.ctx, { filePath: 'C:\\Users\\me\\mystruct.qsc', sceneId: 1 })
        expect(win.scene.setName).toHaveBeenCalledWith('mystruct.qsc')
    })

    it('does NOT set the scene name when read throws (name stays the placeholder)', () => {
        const { ctx, scene, calls } = makeFixture({
            readFn: () => { calls.push('read'); throw new Error('parse fail') },
        })
        // A damaged .qsc used to escape as a throw; it is an io failure now.
        expect(loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 }))
            .toEqual(expect.objectContaining({ ok: false, code: 'io', error: 'parse fail' }))
        expect(scene.setName).not.toHaveBeenCalled()
    })

    it('never calls ctx.cmdMgr.getCmd("load_scene") (no LoadSceneCommand path)', () => {
        const { ctx, getCmd } = makeFixture()
        loadScene(ctx, { filePath: '/x.qsc', sceneId: 1 })
        expect(getCmd).not.toHaveBeenCalled()
    })

    it('returns ok:false when no SCEREADER matches the extension (no undo txn)', () => {
        const { ctx, scene } = makeFixture({
            infoJson: JSON.stringify([
                { name: 'qsc_xml', fext: '*.qsc', category: SCEREADER_CATEGORY },
            ]),
        })
        const result = loadScene(ctx, { filePath: '/test.txt', sceneId: 1 })
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'unsupported' }))
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok:false when createHandler returns null', () => {
        const { ctx } = makeFixture({ readerCreateFails: true })
        const result = loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'unsupported' }))
    })

    it('still calls detach when read throws, and returns the failure (no undo txn)', () => {
        const { ctx, scene, reader, calls } = makeFixture({
            viewUids: '10',
            readFn: () => { calls.push('read'); throw new Error('parse fail') },
        })
        // A damaged .qsc used to escape as a throw; it is an io failure now.
        expect(loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 }))
            .toEqual(expect.objectContaining({ ok: false, code: 'io', error: 'parse fail' }))
        expect(reader.detach).toHaveBeenCalled()
        // No txn was opened, so there is nothing to commit or roll back.
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
    })

    it('skips loadViewFromCam when view_uids is empty', () => {
        const { ctx, scene } = makeFixture({ viewUids: '' })
        loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(scene.loadViewFromCam).not.toHaveBeenCalled()
    })
})


/**
 * `openSceneFile` opens a file into a scene of its own, for the caller to show
 * as a new tab. Scene creation, the read and the view creation are one step on
 * purpose: a failed read used to leave the already-created scene and its view
 * (and the tab the renderer had registered) behind as an empty molview.
 */
describe('openSceneFile.service', () => {
    it('creates the view only after the read, and reports the tab ids', () => {
        const { ctx, scene, calls, addView, destroyScene } = makeFixture()
        const res = openSceneFile(ctx, { filePath: '/dir/test.qsc', dpr: 2 })

        expect(res).toEqual(expect.objectContaining({
            ok: true, scene_uid: 1, view_uid: 500, scene_name: 'test.qsc', view_name: '0',
        }))
        // Read first, view second, so nothing is showable until it loaded.
        expect(calls.indexOf('read')).toBeLessThan(calls.indexOf('createView(500)'))
        expect(addView).toHaveBeenCalledWith(500, 2)
        expect(scene.loadViewFromCam).toHaveBeenCalledWith(500, '__current')
        expect(destroyScene).not.toHaveBeenCalled()
        // A fresh scene needs no clearing.
        expect(scene.clearAllData).not.toHaveBeenCalled()
    })

    it('destroys the scene and creates no view when the read fails', () => {
        const { ctx, scene, reader, destroyScene, addView } = makeFixture({
            readFn: () => { throw new Error('parse fail') },
        })
        const res = openSceneFile(ctx, { filePath: '/dir/test.qsc', dpr: 2 })

        expect(res).toEqual(expect.objectContaining({ ok: false, code: 'io' }))
        expect(scene.createView).not.toHaveBeenCalled()
        expect(addView).not.toHaveBeenCalled()
        expect(destroyScene).toHaveBeenCalledWith(1)
        // Still detached (try/finally).
        expect(reader.detach).toHaveBeenCalledTimes(1)
    })

    it('destroys the scene when no reader claims the file', () => {
        const { ctx, destroyScene, addView } = makeFixture()
        const res = openSceneFile(ctx, { filePath: '/dir/test.unknown', dpr: 1 })

        expect(res).toEqual(expect.objectContaining({ ok: false, code: 'unsupported' }))
        expect(destroyScene).toHaveBeenCalledWith(1)
        expect(addView).not.toHaveBeenCalled()
    })

    it('still reports the read failure when destroying the half-built scene throws', () => {
        const { ctx, destroyScene } = makeFixture({
            readFn: () => { throw new Error('parse fail') },
        })
        destroyScene.mockImplementationOnce(() => { throw new Error('destroy failed') })

        const res = openSceneFile(ctx, { filePath: '/dir/test.qsc', dpr: 1 })
        expect(res).toEqual(expect.objectContaining({
            ok: false, error: expect.stringMatching(/parse fail/),
        }))
    })
})
