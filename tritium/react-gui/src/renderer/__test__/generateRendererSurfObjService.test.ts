import { describe, it, expect, vi, beforeEach } from 'vitest'
import { services } from '@renderer/worker/server/services/rend/rend.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface FixtureOpts {
    /** type_name of the source renderer. Defaults to 'isosurf'. */
    typeName?: string
    /** Source renderer colormode (string, per qif enum runtime). */
    colormode?: string
    /** Source renderer color_mapname (used in multigrad branch as elepot). */
    colorMapName?: string
    /** Pre-existing object names in the scene (for uniq-name testing). */
    existingObjects?: string[]
    /** Pre-existing renderer names in the scene. */
    existingRends?: string[]
    /** Mol returned by rend.getClientObj(). null to simulate missing. */
    molName?: string | null
    /** When false, scene lookup fails. */
    sceneExists?: boolean
    /** When false, scene.getRenderer fails. */
    rendExists?: boolean
}

function makeFixture(opts: FixtureOpts = {}) {
    const {
        typeName = 'isosurf',
        colormode = 'solid',
        colorMapName = 'sigma',
        existingObjects = [],
        existingRends = [],
        molName = 'mol1',
        sceneExists = true,
        rendExists = true,
    } = opts

    // --- source isosurf renderer ---
    const srcMultiGrad = { __srcGrad: true }
    const srcDefaultColor = { __srcColor: true }
    const srcMol = molName === null ? null : { name: molName }

    const srcRend = {
        get type_name() { return typeName },
        get colormode() { return colormode as unknown as number },
        get multi_grad() { return srcMultiGrad },
        get color_mapname() { return colorMapName },
        get defaultcolor() { return srcDefaultColor },
        getClientObj: vi.fn(() => srcMol),
        generateSurfObj: vi.fn(() => newObj),
    }

    // --- new MolSurfObj returned by generateSurfObj ---
    const setNewObjName = vi.fn()
    const newObj: Record<string, unknown> = {
        uid: 555,
        get name() { return _newObjName },
        set name(v: string) { _newObjName = v; setNewObjName(v) },
        createRenderer: vi.fn((_type: string) => newRend),
    }
    let _newObjName = ''

    // --- molsurf renderer attached to the new object ---
    const setNewRendName = vi.fn()
    const setNewRendColormode = vi.fn()
    const setNewRendElepot = vi.fn()
    const setNewRendDefaultColor = vi.fn()
    const copyFromMultiGrad = vi.fn()
    const newRend: Record<string, unknown> = {
        uid: 777,
        get name() { return _newRendName },
        set name(v: string) { _newRendName = v; setNewRendName(v) },
        set colormode(v: unknown) { setNewRendColormode(v) },
        get multi_grad() { return { copyFrom: copyFromMultiGrad } },
        set elepot(v: string) { setNewRendElepot(v) },
        set defaultcolor(v: unknown) { setNewRendDefaultColor(v) },
    }
    let _newRendName = ''

    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const scene = {
        uid: 1,
        getRenderer: vi.fn(() => (rendExists ? srcRend : null)),
        getObjectByName: vi.fn((n: string) =>
            existingObjects.includes(n) ? { __obj: n } : null,
        ),
        getRendByName: vi.fn((n: string) =>
            existingRends.includes(n) ? { __rend: n } : null,
        ),
        addObject: vi.fn(),
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }

    const ctx = {
        sceMgr: { getScene: vi.fn(() => (sceneExists ? scene : null)) },
    } as unknown as WorkerContext

    return {
        ctx, scene, srcRend, newObj, newRend, srcMultiGrad, srcDefaultColor,
        setNewObjName, setNewRendName, setNewRendColormode, setNewRendElepot,
        setNewRendDefaultColor, copyFromMultiGrad,
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
    }
}

const baseArgs = { sceneId: 1, rendId: 100 }

describe('generateRendererSurfObj — happy path (solid colormode)', () => {
    beforeEach(() => vi.clearAllMocks())

    it('creates new object + molsurf renderer with unique names and transfers defaultcolor', () => {
        const { ctx, scene, newObj, srcDefaultColor,
            setNewObjName, setNewRendName, setNewRendDefaultColor,
            startUndoTxn, commitUndoTxn } = makeFixture({ colormode: 'solid' })
        const res = services.generateRendererSurfObj(ctx, baseArgs)
        expect(res.ok).toBe(true)
        expect(res.newObjId).toBe(555)
        expect(res.newRendId).toBe(777)
        expect(res.newObjName).toBe('mol1_sf')
        expect(setNewObjName).toHaveBeenCalledWith('mol1_sf')
        expect(scene.addObject).toHaveBeenCalledWith(newObj)
        expect(newObj.createRenderer).toHaveBeenCalledWith('molsurf')
        expect(setNewRendName).toHaveBeenCalledWith('molsurf')
        expect(setNewRendDefaultColor).toHaveBeenCalledWith(srcDefaultColor)
        expect(startUndoTxn).toHaveBeenCalledWith('Generate surfobj')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('skips digit suffix on first try, then appends 1, 2, ... if name exists', () => {
        const { ctx, setNewObjName, setNewRendName } = makeFixture({
            existingObjects: ['mol1_sf', 'mol1_sf1'],
            existingRends: ['molsurf'],
        })
        services.generateRendererSurfObj(ctx, baseArgs)
        expect(setNewObjName).toHaveBeenCalledWith('mol1_sf2')
        expect(setNewRendName).toHaveBeenCalledWith('molsurf1')
    })
})

describe('generateRendererSurfObj — multigrad colormode', () => {
    beforeEach(() => vi.clearAllMocks())

    it('copies multi_grad and sets elepot from color_mapname', () => {
        const { ctx, srcMultiGrad,
            setNewRendColormode, copyFromMultiGrad, setNewRendElepot,
            setNewRendDefaultColor } = makeFixture({
                colormode: 'multigrad', colorMapName: 'elepot1',
            })
        const res = services.generateRendererSurfObj(ctx, baseArgs)
        expect(res.ok).toBe(true)
        expect(setNewRendColormode).toHaveBeenCalledWith('multigrad')
        expect(copyFromMultiGrad).toHaveBeenCalledWith(srcMultiGrad)
        expect(setNewRendElepot).toHaveBeenCalledWith('elepot1')
        // multigrad branch should NOT touch defaultcolor.
        expect(setNewRendDefaultColor).not.toHaveBeenCalled()
    })
})

describe('generateRendererSurfObj — failure modes', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns ok:false when scene lookup fails', () => {
        const { ctx } = makeFixture({ sceneExists: false })
        expect(services.generateRendererSurfObj(ctx, baseArgs))
            .toEqual({ ok: false })
    })

    it('returns ok:false when renderer lookup fails', () => {
        const { ctx } = makeFixture({ rendExists: false })
        expect(services.generateRendererSurfObj(ctx, baseArgs))
            .toEqual({ ok: false })
    })

    it('returns ok:false for non-isosurf renderer types', () => {
        const { ctx, srcRend } = makeFixture({ typeName: 'molsurf' })
        const res = services.generateRendererSurfObj(ctx, baseArgs)
        expect(res).toEqual({ ok: false })
        expect(srcRend.generateSurfObj).not.toHaveBeenCalled()
    })

    it('returns ok:false when the parent mol cannot be resolved', () => {
        const { ctx, srcRend } = makeFixture({ molName: null })
        const res = services.generateRendererSurfObj(ctx, baseArgs)
        expect(res).toEqual({ ok: false })
        expect(srcRend.generateSurfObj).not.toHaveBeenCalled()
    })
})
