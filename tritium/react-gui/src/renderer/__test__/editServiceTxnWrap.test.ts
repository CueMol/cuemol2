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

const SCEREADER_CATEGORY = 3

function makeCtx(opts: {
    objreaderReadFn?: () => void
    scereaderReadFn?: () => void
} = {}) {
    const calls: string[] = []

    const mockMol = { name: '', getClassName: () => 'MolCoord' }

    // loadObject path: LoadObjectCommand mock. `run()` either records
    // a success or throws (used by the rollback test). `result_object`
    // returns mockMol after a successful run.
    const cmdRunFn = opts.objreaderReadFn ?? (() => calls.push('cmd.run'))
    const loadObjCmd: Record<string, unknown> = {
        setTargetScene: vi.fn(() => calls.push('setTargetScene')),
        run: vi.fn(cmdRunFn),
    }
    let fp = '', ff = '', on = ''
    let cf = false
    Object.defineProperty(loadObjCmd, 'file_path', { get() { return fp }, set(v: string) { fp = v } })
    Object.defineProperty(loadObjCmd, 'file_format', { get() { return ff }, set(v: string) { ff = v } })
    Object.defineProperty(loadObjCmd, 'object_name', { get() { return on }, set(v: string) { on = v } })
    Object.defineProperty(loadObjCmd, 'content_first', { get() { return cf }, set(v: boolean) { cf = v } })
    Object.defineProperty(loadObjCmd, 'result_object', { get() { return mockMol } })

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

    const sceInfo = JSON.stringify([
        { name: 'qsc_xml', fext: '*.qsc', category: SCEREADER_CATEGORY },
    ])

    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
        cmdMgr: {
            getCmd: vi.fn((name: string) => {
                if (name === 'load_object') return loadObjCmd
                throw new Error(`cmd path not used: ${name}`)
            }),
        },
        strMgr: {
            getInfoJSON2: vi.fn(() => sceInfo),
            createHandler: vi.fn((name: string, cat: number) => {
                if (cat === SCEREADER_CATEGORY && name === 'qsc_xml') return sceReader
                return null
            }),
        },
    } as unknown as WorkerContext

    return { calls, ctx, mockScene, loadObjCmd, sceReader }
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

describe('loadScene service — undo txn wrapping', () => {
    let calls: string[]
    let ctx: WorkerContext

    beforeEach(() => {
        const m = makeCtx()
        calls = m.calls
        ctx = m.ctx
    })

    it('wraps body with startUndoTxn("Open scene") and commitUndoTxn', () => {
        loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(calls[0]).toBe('start:Open scene')
        expect(calls).toContain('commit')
        expect(calls).not.toContain('rollback')
    })
})
