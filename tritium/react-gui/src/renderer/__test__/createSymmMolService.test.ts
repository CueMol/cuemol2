/**
 * Pin contracts for `createSymmMol.service` (UXP `createSymmObj` port):
 *   - getCreateSymmMolOptions: resolves view -> scene, reuses the shared
 *     getNewRendererOptions resolver, and suggests a unique
 *     `"<mol name> <symop name>"` object name (parens suffix on collision).
 *   - createSymmMol: creates a MolCoord, copies all atoms from the source
 *     mol, transforms by the symop matrix from the hit `*symm` renderer
 *     (`getXformMatrix(symmId)`), adds it to the scene and delegates
 *     renderer creation to setupRenderer -- all inside one
 *     'Create symm mol' undo txn, rolled back on any failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))
vi.mock('../worker/server/services/setupRenderer.service', () => ({
    setupRenderer: vi.fn(() => ({ uid: 500 })),
}))
vi.mock('../worker/server/services/getNewRendererOptions.service', () => ({
    getNewRendererOptions: vi.fn(),
}))

import { services } from '../worker/server/services/createSymmMol.service'
import { setupRenderer } from '../worker/server/services/setupRenderer.service'
import { makeSel } from '../worker/server/services/helpers/makeSel'
import { getNewRendererOptions } from '../worker/server/services/getNewRendererOptions.service'

const { getCreateSymmMolOptions, createSymmMol } = services

const RENDER_OPTS = {
    objectName: 'ignored-by-service',
    rendererType: 'simple',
    rendererName: 'simple1',
    selectionEnabled: false,
    selection: '*',
    centerView: true,
}

function makeScene(uid = 100) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(),
        getRenderer: vi.fn(),
        getObjectByName: vi.fn(() => null),
        addObject: vi.fn(),
    }
}

function makeCtx(scene: ReturnType<typeof makeScene> | null, newMol?: unknown) {
    const view = scene ? { getScene: vi.fn(() => scene) } : null
    return {
        sceMgr: {
            getView: vi.fn((id: number) => (id === 1 ? view : null)),
            getScene: vi.fn(),
        },
        svc: {
            createObj: vi.fn((name: string) => (name === 'MolCoord' ? newMol : null)),
        },
    } as unknown as WorkerContext
}

function makeNewMol(opts: { copyOk?: boolean } = {}) {
    const setName = vi.fn()
    const mol = {
        uid: 77,
        get name() { return '' },
        set name(v: string) { setName(v) },
        copyAtoms: vi.fn(() => opts.copyOk ?? true),
        xformByMat: vi.fn(),
    }
    return { mol, setName }
}

beforeEach(() => vi.clearAllMocks())

describe('getCreateSymmMolOptions', () => {
    it('returns ok=false when the view/object cannot be resolved', () => {
        const ctx = makeCtx(null)
        const res = getCreateSymmMolOptions(ctx, { viewId: 1, objId: 5, symmName: 'x,y,z' })
        expect(res.ok).toBe(false)
        expect(getNewRendererOptions).not.toHaveBeenCalled()
    })

    it('suggests a unique "<mol> <symop>" name from the shared resolver data', () => {
        const scene = makeScene(100)
        scene.getObject = vi.fn(() => ({}))
        // First candidate is taken -> expect the "(1)" suffix.
        scene.getObjectByName = vi.fn((n: string) => (n === '1crn x,1/2-y,-z' ? {} : null))
        const ctx = makeCtx(scene)
        vi.mocked(getNewRendererOptions).mockReturnValue({
            ok: true,
            targetObjId: 5,
            groupName: '',
            rendererTypes: ['simple', 'ribbon'],
            defaultName: 'simple1',
            objName: '1crn',
            objClassName: 'MolCoord',
            isMol: true,
            currentSel: '',
            presetTypes: [{ name: 'Default1RendPreset', desc: 'Default1' }],
        })

        const res = getCreateSymmMolOptions(ctx, { viewId: 1, objId: 5, symmName: 'x,1/2-y,-z' })

        expect(getNewRendererOptions).toHaveBeenCalledWith(ctx, {
            sceneId: 100,
            sourceNodeId: 5,
            sourceNodeType: 'object',
        })
        expect(res).toEqual({
            ok: true,
            sceneId: 100,
            objName: '1crn x,1/2-y,-z(1)',
            objClassName: 'MolCoord',
            rendererTypes: ['simple', 'ribbon'],
            presetTypes: [{ name: 'Default1RendPreset', desc: 'Default1' }],
            defaultRendName: 'simple1',
        })
    })
})

describe('createSymmMol', () => {
    function makeHappyPath() {
        const scene = makeScene(100)
        const srcMol = { __src: true }
        const matrix = { __matrix: true }
        const rend = { getXformMatrix: vi.fn(() => matrix) }
        scene.getObject = vi.fn((id: number) => (id === 5 ? srcMol : null))
        scene.getRenderer = vi.fn((id: number) => (id === 10 ? rend : null))
        const { mol: newMol, setName } = makeNewMol()
        const ctx = makeCtx(scene, newMol)
        return { ctx, scene, srcMol, matrix, rend, newMol, setName }
    }

    it('copies, transforms, adds and sets up the renderer inside one undo txn', () => {
        const { ctx, scene, srcMol, matrix, rend, newMol, setName } = makeHappyPath()

        const res = createSymmMol(ctx, {
            viewId: 1, objId: 5, rendId: 10, symmId: 3,
            objName: '  1crn x,1/2-y,-z  ', rendOpts: RENDER_OPTS,
        })

        expect(rend.getXformMatrix).toHaveBeenCalledWith(3)
        expect(setName).toHaveBeenCalledWith('1crn x,1/2-y,-z')
        const sel = vi.mocked(makeSel).mock.results[0].value
        expect(vi.mocked(makeSel)).toHaveBeenCalledWith(ctx, '*', 100)
        expect(newMol.copyAtoms).toHaveBeenCalledWith(srcMol, sel)
        expect(newMol.xformByMat).toHaveBeenCalledWith(matrix, sel)
        expect(scene.addObject).toHaveBeenCalledWith(newMol)
        expect(setupRenderer).toHaveBeenCalledWith(ctx, newMol, RENDER_OPTS)

        // Pin the mutation order: copy -> transform -> register -> renderer.
        const orderOf = (fn: unknown) =>
            vi.mocked(fn as () => void).mock.invocationCallOrder[0]
        expect(orderOf(newMol.copyAtoms)).toBeLessThan(orderOf(newMol.xformByMat))
        expect(orderOf(newMol.xformByMat)).toBeLessThan(orderOf(scene.addObject))
        expect(orderOf(scene.addObject)).toBeLessThan(orderOf(setupRenderer))

        expect(scene.startUndoTxn).toHaveBeenCalledWith('Create symm mol')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
        expect(res).toEqual({ ok: true, newObjId: 77, newObjName: '1crn x,1/2-y,-z' })
    })

    it('rolls back and reports the error when copyAtoms fails', () => {
        const { ctx, scene } = makeHappyPath()
        const { mol: failMol } = makeNewMol({ copyOk: false })
        ;(ctx.svc.createObj as ReturnType<typeof vi.fn>).mockReturnValue(failMol)

        const res = createSymmMol(ctx, {
            viewId: 1, objId: 5, rendId: 10, symmId: 3,
            objName: 'x', rendOpts: RENDER_OPTS,
        })

        expect(res.ok).toBe(false)
        expect(res.error).toContain('copyAtoms failed')
        expect(scene.addObject).not.toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('rolls back when setupRenderer fails after addObject', () => {
        const { ctx, scene } = makeHappyPath()
        vi.mocked(setupRenderer).mockReturnValue(null)

        const res = createSymmMol(ctx, {
            viewId: 1, objId: 5, rendId: 10, symmId: 3,
            objName: 'x', rendOpts: RENDER_OPTS,
        })

        expect(res.ok).toBe(false)
        expect(res.error).toContain('renderer creation failed')
        expect(scene.addObject).toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
    })

    it('fails fast without a txn when the symm renderer is missing', () => {
        const { ctx, scene } = makeHappyPath()
        scene.getRenderer = vi.fn(() => null)

        const res = createSymmMol(ctx, {
            viewId: 1, objId: 5, rendId: 10, symmId: 3,
            objName: 'x', rendOpts: RENDER_OPTS,
        })

        expect(res).toEqual({ ok: false, error: 'symm renderer not found' })
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})
