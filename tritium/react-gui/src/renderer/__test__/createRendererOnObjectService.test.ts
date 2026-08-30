import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { RendererOptions } from '@renderer/dialogs/fopen-opt-dlgs/types'

// Mock setupRenderer so the test isolates createRendererOnObject's
// resolution + undo-txn wiring from the actual renderer-creation code
// (which exercises C++ command objects out of scope for this unit).
vi.mock('@renderer/worker/server/services/rend/setupRenderer', () => ({
    setupRenderer: vi.fn(),
}))

import { services } from '@renderer/worker/server/services/rend/rend.service'
import { setupRenderer } from '@renderer/worker/server/services/rend/setupRenderer'
const setupMock = setupRenderer as unknown as ReturnType<typeof vi.fn>

interface FixtureOpts {
    sceneExists?: boolean
    objExists?: boolean
}

function buildFixture(opts: FixtureOpts = {}) {
    const obj = opts.objExists === false ? null : { uid: 10, name: 'mol1' }
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()
    const scene = {
        getObject: vi.fn(() => obj),
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
    const ctx = {
        sceMgr: { getScene: vi.fn(() => (opts.sceneExists === false ? null : scene)) },
        cmdMgr: { getCmd: vi.fn() },
        strMgr: {},
    } as unknown as WorkerContext
    return { ctx, scene, obj, startUndoTxn, commitUndoTxn }
}

const baseOpts: RendererOptions = {
    objectName: 'mol1',
    rendererType: 'cartoon',
    rendererName: 'cartoon1',
    selectionEnabled: false,
    selection: '*',
    centerView: true,
}

function defaultMockRend(opts: RendererOptions) {
    return {
        uid: 444,
        name: opts.rendererName,
    }
}

describe('createRendererOnObject.service', () => {
    beforeEach(() => {
        setupMock.mockReset()
        setupMock.mockImplementation((_ctx, _mol, opts: RendererOptions) =>
            defaultMockRend(opts),
        )
    })

    it('wraps setupRenderer in a "Create new <type> renderer" undo txn', () => {
        const f = buildFixture()
        const res = services.createRendererOnObject(f.ctx, {
            sceneId: 1, objId: 10, rendOpts: baseOpts,
        })
        expect(res).toEqual({ ok: true, newRendId: 444, newName: 'cartoon1' })
        expect(f.startUndoTxn).toHaveBeenCalledWith('Create new cartoon renderer')
        expect(f.commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('assigns rend.group when groupName is provided', () => {
        const f = buildFixture()
        const groupSetter = vi.fn()
        setupMock.mockImplementationOnce(() => ({
            uid: 444,
            name: 'cartoon1',
            get group(): string { return '' },
            set group(v: string) { groupSetter(v) },
        }))
        const res = services.createRendererOnObject(f.ctx, {
            sceneId: 1, objId: 10, rendOpts: baseOpts, groupName: 'grpA',
        })
        expect(res.ok).toBe(true)
        expect(groupSetter).toHaveBeenCalledWith('grpA')
    })

    it('uses a "Create preset renderer <name>" txn label for preset options', () => {
        const f = buildFixture()
        const res = services.createRendererOnObject(f.ctx, {
            sceneId: 1, objId: 10,
            rendOpts: { ...baseOpts, presetName: 'Default1RendPreset', rendererName: 'default1_1' },
        })
        expect(res.ok).toBe(true)
        expect(f.startUndoTxn).toHaveBeenCalledWith(
            'Create preset renderer Default1RendPreset',
        )
    })

    it('never assigns rend.group for a preset even when groupName is provided', () => {
        const f = buildFixture()
        const groupSetter = vi.fn()
        setupMock.mockImplementationOnce(() => ({
            uid: 444,
            name: 'default1_1',
            get group(): string { return '' },
            set group(v: string) { groupSetter(v) },
        }))
        const res = services.createRendererOnObject(f.ctx, {
            sceneId: 1, objId: 10,
            rendOpts: { ...baseOpts, presetName: 'Default1RendPreset' },
            groupName: 'grpA',
        })
        expect(res.ok).toBe(true)
        // A preset creates its own group; nesting is unsupported.
        expect(groupSetter).not.toHaveBeenCalled()
    })

    it('returns ok:false when scene cannot be resolved', () => {
        const f = buildFixture({ sceneExists: false })
        const res = services.createRendererOnObject(f.ctx, {
            sceneId: 99, objId: 10, rendOpts: baseOpts,
        })
        expect(res.ok).toBe(false)
        expect(f.startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok:false when target object cannot be resolved', () => {
        const f = buildFixture({ objExists: false })
        const res = services.createRendererOnObject(f.ctx, {
            sceneId: 1, objId: 99, rendOpts: baseOpts,
        })
        expect(res.ok).toBe(false)
    })

    it('returns ok:false when setupRenderer returns null', () => {
        const f = buildFixture()
        setupMock.mockReturnValueOnce(null)
        const res = services.createRendererOnObject(f.ctx, {
            sceneId: 1, objId: 10, rendOpts: baseOpts,
        })
        expect(res.ok).toBe(false)
    })
})
