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

    const objReader = {
        setPath: vi.fn(),
        attach: vi.fn(),
        read: vi.fn(opts.objreaderReadFn ?? (() => calls.push('reader.read'))),
        detach: vi.fn(),
        createDefaultObj: vi.fn(() => mockMol),
    }
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

    const objInfo = JSON.stringify([
        { name: 'pdb', fext: '*.pdb', category: OBJREADER_CATEGORY },
    ])
    const sceInfo = JSON.stringify([
        { name: 'qsc_xml', fext: '*.qsc', category: SCEREADER_CATEGORY },
    ])

    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
        cmdMgr: { getCmd: vi.fn(() => { throw new Error('cmd path not used') }) },
        strMgr: {
            getInfoJSON2: vi.fn(() => `${objInfo.slice(0, -1)},${sceInfo.slice(1)}`),
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
