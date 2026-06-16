/**
 * Cross-cutting undo-txn-wrap contract for loadObject / loadScene.
 *
 * Pins: both services run their body inside startUndoTxn / commitUndoTxn,
 * and roll back on throw. The direct-API call shapes (reader.read,
 * scene.addObject, etc.) are covered in detail by the per-service tests
 * (`loadSceneService.test.ts`, `loadObjectService.test.ts`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/setupRenderer.service', () => ({
    setupRenderer: vi.fn(),
}))

import { services as loadObjectServices } from '../worker/server/services/loadObject.service'
import { services as loadSceneServices } from '../worker/server/services/loadScene.service'
const { loadObject } = loadObjectServices
const { loadScene } = loadSceneServices

const OBJREADER_CATEGORY = 0
const SCEREADER_CATEGORY = 3

function makeCtx(opts: {
    objreaderReadFn?: () => void
    scereaderReadFn?: () => void
} = {}) {
    const calls: string[] = []

    const mockMol = { name: '', getClassName: () => 'MolCoord' }

    // loadObject path: reader-based load (no LoadObjectCommand). createHandler
    // returns this objReader for the 'pdb' nickname; read() either records a
    // success or throws (used by the rollback test).
    const objReader = {
        setPath: vi.fn(),
        createDefaultObj: vi.fn(() => mockMol),
        attach: vi.fn(),
        read: vi.fn(opts.objreaderReadFn ?? (() => calls.push('reader.read'))),
        detach: vi.fn(),
    }

    // loadScene path: still the direct-API SceneXMLReader call.
    const sceReader = {
        setPath: vi.fn(),
        attach: vi.fn(),
        read: vi.fn(opts.scereaderReadFn ?? (() => calls.push('reader.read'))),
        detach: vi.fn(),
    }

    const mockScene = {
        view_uids: '',
        getView: vi.fn(),
        loadViewFromCam: vi.fn(),
        addObject: vi.fn(),
        startUndoTxn: vi.fn((label: string) => calls.push(`start:${label}`)),
        commitUndoTxn: vi.fn(() => calls.push('commit')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollback')),
    }

    // Reader info: a pdb objreader and the qsc scene reader, so pickReaderName
    // (ext-first) resolves /test.pdb -> 'pdb' and /test.qsc -> 'qsc_xml'.
    const info = JSON.stringify([
        { name: 'pdb', fext: '*.pdb', category: OBJREADER_CATEGORY },
        { name: 'qsc_xml', fext: '*.qsc', category: SCEREADER_CATEGORY },
    ])

    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
        strMgr: {
            getInfoJSON2: vi.fn(() => info),
            createHandler: vi.fn((name: string, cat: number) => {
                if (cat === OBJREADER_CATEGORY && name === 'pdb') return objReader
                if (cat === SCEREADER_CATEGORY && name === 'qsc_xml') return sceReader
                return null
            }),
        },
    } as unknown as WorkerContext

    return { calls, ctx, mockScene, objReader, sceReader }
}

describe('loadObject service — undo txn wrapping', () => {
    let calls: string[]
    let ctx: WorkerContext

    beforeEach(() => {
        const m = makeCtx()
        calls = m.calls
        ctx = m.ctx
    })

    it('wraps body with startUndoTxn("Open file") and commitUndoTxn', () => {
        loadObject(ctx, {
            filePath: '/test.pdb',
            sceneId: 1,
            options: {
                format: { kind: 'unknown' },
                renderer: { objectName: '', rendererType: 'BallStick', rendererName: 'bs1', centerView: false, selection: '*' },
            } as any,
            contentFirst: false,
        })
        expect(calls[0]).toBe('start:Open file')
        expect(calls).toContain('commit')
        expect(calls).not.toContain('rollback')
    })

    it('calls rollbackUndoTxn and re-throws on error', () => {
        const m = makeCtx({ objreaderReadFn: () => { throw new Error('cmd failed') } })
        expect(() =>
            loadObject(m.ctx, {
                filePath: '/fail.pdb',
                sceneId: 1,
                options: { format: { kind: 'unknown' }, renderer: { objectName: '', rendererType: '', rendererName: '', centerView: false, selection: '' } } as any,
                contentFirst: false,
            })
        ).toThrow('cmd failed')
        expect(m.calls).toContain('start:Open file')
        expect(m.calls).toContain('rollback')
        expect(m.calls).not.toContain('commit')
    })
})

describe('loadScene service — NOT undo-txn-wrapped (by design)', () => {
    let calls: string[]
    let ctx: WorkerContext
    let mockScene: ReturnType<typeof makeCtx>['mockScene']

    beforeEach(() => {
        const m = makeCtx()
        calls = m.calls
        ctx = m.ctx
        mockScene = m.mockScene
    })

    // A whole-scene load is not an edit: loadScene mirrors UXP
    // `qsc-io.readSceneFile` / C++ `LoadSceneCommand::run()`, both of which run
    // OUTSIDE any undo txn so the object-registration records are discarded and
    // the undo stack stays empty. Wrapping it was the bug. This test pins the
    // current (correct) contract: loadScene runs its body with NO startUndoTxn /
    // commitUndoTxn / rollbackUndoTxn at all.
    it('runs reader.read without any startUndoTxn / commit / rollback', () => {
        loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(calls).toContain('reader.read')
        expect(calls.some((c) => c.startsWith('start:'))).toBe(false)
        expect(calls).not.toContain('commit')
        expect(calls).not.toContain('rollback')
        expect(mockScene.startUndoTxn).not.toHaveBeenCalled()
        expect(mockScene.commitUndoTxn).not.toHaveBeenCalled()
        expect(mockScene.rollbackUndoTxn).not.toHaveBeenCalled()
    })
})
