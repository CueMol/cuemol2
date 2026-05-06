import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/setupRenderer.service', () => ({
    setupRenderer: vi.fn(),
}))

// Import services after mock is registered (vi.mock is hoisted automatically)
import { services as loadObjectServices } from '../worker/server/services/loadObject.service'
import { services as loadSceneServices } from '../worker/server/services/loadScene.service'
const { loadObject } = loadObjectServices
const { loadScene } = loadSceneServices

function makeSceneAndCtx(cmdExtra: Record<string, unknown> = {}) {
    const calls: string[] = []

    const mockScene = {
        startUndoTxn: vi.fn((label: string) => { calls.push(`start:${label}`) }),
        commitUndoTxn: vi.fn(() => { calls.push('commit') }),
        rollbackUndoTxn: vi.fn(() => { calls.push('rollback') }),
    }

    const mockMol = { name: '', getClassName: () => 'MolCoord' }

    const mockLoadObjCmd = {
        target_scene: null as unknown,
        file_path: '',
        run: vi.fn(() => { calls.push('cmd.run') }),
        result_object: mockMol,
    }

    const mockLoadSceneCmd = {
        target_scene: null as unknown,
        file_path: '',
        set_camera: false,
        run: vi.fn(() => { calls.push('cmd.run') }),
        ...cmdExtra,
    }

    const ctx = {
        sceMgr: { getScene: vi.fn(() => mockScene) },
        cmdMgr: { getCmd: vi.fn((name: string) => {
            if (name === 'load_object') return mockLoadObjCmd
            if (name === 'load_scene') return mockLoadSceneCmd
            return null
        }) },
    } as unknown as WorkerContext

    return { calls, mockScene, ctx }
}

describe('loadObject service — undo txn wrapping', () => {
    let calls: string[]
    let ctx: WorkerContext

    beforeEach(() => {
        const m = makeSceneAndCtx()
        calls = m.calls
        ctx = m.ctx
    })

    it('wraps body with startUndoTxn("Open file") and commitUndoTxn', () => {
        loadObject(ctx, {
            filePath: '/test.pdb',
            sceneId: 1,
            options: {
                format: { kind: 'unknown' },
                renderer: { objectName: '', rendererType: 'BallStick', rendererName: 'bs1', centerView: true, selection: '*' },
            } as any,
        })
        expect(calls).toEqual(['start:Open file', 'cmd.run', 'commit'])
    })

    it('calls rollbackUndoTxn and re-throws on error', () => {
        const { calls: c, ctx: ctx2, mockScene } = makeSceneAndCtx()
        ;(mockScene.commitUndoTxn as any) = vi.fn(() => { c.push('commit') })
        ;(ctx2 as any).cmdMgr.getCmd = vi.fn(() => ({
            target_scene: null,
            file_path: '',
            run: vi.fn(() => { throw new Error('cmd failed') }),
            result_object: null,
        }))
        expect(() =>
            loadObject(ctx2, {
                filePath: '/fail.pdb',
                sceneId: 1,
                options: { format: { kind: 'unknown' }, renderer: { objectName: '', rendererType: '', rendererName: '', centerView: false, selection: '' } } as any,
            })
        ).toThrow('cmd failed')
        expect(c).toContain('start:Open file')
        expect(c).toContain('rollback')
        expect(c).not.toContain('commit')
    })
})

describe('loadScene service — undo txn wrapping', () => {
    let calls: string[]
    let ctx: WorkerContext

    beforeEach(() => {
        const m = makeSceneAndCtx()
        calls = m.calls
        ctx = m.ctx
    })

    it('wraps body with startUndoTxn("Open scene") and commitUndoTxn', () => {
        loadScene(ctx, { filePath: '/test.qsc', sceneId: 1 })
        expect(calls).toEqual(['start:Open scene', 'cmd.run', 'commit'])
    })
})
