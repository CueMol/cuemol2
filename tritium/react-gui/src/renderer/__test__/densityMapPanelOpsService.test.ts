/**
 * Pin contracts for `densityMapPanelOps.service`:
 *   - listMapRenderers: walks the scene tree, filters by renderer type
 *     (contour | isosurf | gpu_mapmesh | gpu_mapvol), surfaces parent
 *     obj id/name, recurses into renderer groups.
 *   - getMapRendererState: returns null on missing scene/renderer;
 *     populates all 9 driven fields; falls back gracefully when
 *     getClientObj() / den_sigma throw.
 *   - setMapRendererProp: "color" path routes through makeColor and
 *     assigns the AbstractColor wrapper to setProp("color", ...); the
 *     other prop names pass through setProp(name, value) verbatim; all
 *     mutations are wrapped in a "Change map renderer prop" undo txn.
 *   - redrawMapCenter: small-movement guard (< 0.1 A) skips the
 *     mutation; large movement assigns view center under a "Change map
 *     renderer center" undo txn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/helpers/makeColor', () => ({
    makeColor: vi.fn((_ctx, value: string, _uid: number) => ({
        __color: value,
    })),
}))

import { services } from '../worker/server/services/densityMapPanelOps.service'
import { makeColor } from '../worker/server/services/helpers/makeColor'

const {
    listMapRenderers,
    getMapRendererState,
    setMapRendererProp,
    redrawMapCenter,
} = services

function makeUndoScene(uid: number) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(),
        getRenderer: vi.fn(),
        getSceneDataJSON: vi.fn(() => '[]'),
    }
}

function makeCtx(opts: {
    scene?: ReturnType<typeof makeUndoScene> | null
    view?: Record<string, unknown> | null
    sceneId?: number
    viewId?: number
}) {
    const sid = opts.sceneId ?? 100
    const vid = opts.viewId ?? 7
    return {
        sceMgr: {
            getScene: vi.fn((id: number) => (id === sid ? opts.scene ?? null : null)),
            getView: vi.fn((id: number) => (id === vid ? opts.view ?? null : null)),
        },
        svc: {
            getService: vi.fn(() => null),
        },
    } as unknown as WorkerContext
}

// --- listMapRenderers ---

describe('listMapRenderers', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns empty when scene missing', () => {
        const ctx = makeCtx({ scene: null })
        expect(listMapRenderers(ctx, { sceneId: 100 })).toEqual({ items: [] })
    })

    it('collects only renderers whose type is in the map filter', () => {
        const scene = makeUndoScene(100)
        scene.getSceneDataJSON = vi.fn(() => JSON.stringify([
            { ID: 100, type: '', name: 'scene' },
            {
                ID: 1, type: 'DensityMap', name: 'mtz1', visible: true,
                rends: [
                    { ID: 11, type: 'isosurf', name: 'isosurf1' },
                    { ID: 12, type: 'mesh', name: 'mesh1' }, // not in filter
                ],
            },
            {
                ID: 2, type: 'MolCoord', name: 'mol1', visible: true,
                rends: [{ ID: 21, type: 'cartoon', name: 'rib' }],
            },
            {
                ID: 3, type: 'DensityMap', name: 'mtz2', visible: true,
                rends: [
                    { ID: 31, type: 'contour', name: 'cont' },
                    { ID: 32, type: 'gpu_mapvol', name: 'vol' },
                ],
            },
        ]))
        const ctx = makeCtx({ scene })
        const res = listMapRenderers(ctx, { sceneId: 100 })
        expect(res.items).toHaveLength(3)
        expect(res.items.map((e) => e.rendId).sort()).toEqual([11, 31, 32])
        const first = res.items.find((e) => e.rendId === 11)!
        expect(first.type).toBe('isosurf')
        expect(first.objId).toBe(1)
        expect(first.objName).toBe('mtz1')
        expect(first.rendName).toBe('isosurf1')
    })

    it('recurses into renderer groups (childNodes)', () => {
        const scene = makeUndoScene(100)
        scene.getSceneDataJSON = vi.fn(() => JSON.stringify([
            { ID: 100, type: '', name: 'scene' },
            {
                ID: 1, type: 'DensityMap', name: 'm', visible: true,
                rends: [
                    {
                        ID: 50, type: 'group', name: 'g',
                        childNodes: [
                            { ID: 51, type: 'gpu_mapmesh', name: 'inner' },
                        ],
                    },
                ],
            },
        ]))
        const ctx = makeCtx({ scene })
        const res = listMapRenderers(ctx, { sceneId: 100 })
        expect(res.items).toHaveLength(1)
        expect(res.items[0]).toEqual({
            rendId: 51,
            rendName: 'inner',
            type: 'gpu_mapmesh',
            objId: 1,
            objName: 'm',
        })
    })
})

// --- getMapRendererState ---

describe('getMapRendererState', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns state=null when scene or renderer missing', () => {
        expect(
            getMapRendererState(makeCtx({ scene: null }), { sceneId: 100, rendId: 1 }),
        ).toEqual({ state: null })

        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => null)
        expect(
            getMapRendererState(makeCtx({ scene }), { sceneId: 100, rendId: 1 }),
        ).toEqual({ state: null })
    })

    it('populates all driven fields from the renderer + parent ScalarObject', () => {
        const parent = { den_sigma: 0.42 }
        const rend = {
            alpha: 0.8,
            color: { toString: () => '#FF0000' },
            colormode: 'multigrad',
            extent: 25,
            siglevel: 1.5,
            use_abslevel: false,
            maxLevel: 5,
            minLevel: -5,
            maxExtent: 60,
            getClientObj: () => parent,
            // getPropsJSON drives the per-prop default flags surfaced for the
            // drag restore: alpha is still default, siglevel was modified,
            // extent has no default flag (-> treated as non-default).
            getPropsJSON: () => JSON.stringify([
                { name: 'alpha', type: 'real', value: 0.8, hasdefault: true, isdefault: true },
                { name: 'siglevel', type: 'real', value: 1.5, hasdefault: true, isdefault: false },
                { name: 'extent', type: 'real', value: 25 },
            ]),
        }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })
        const { state } = getMapRendererState(ctx, { sceneId: 100, rendId: 11 })
        expect(state).toEqual({
            alpha: 0.8,
            color: '#FF0000',
            colormode: 'multigrad',
            extent: 25,
            siglevel: 1.5,
            useAbsLevel: false,
            maxLevel: 5,
            minLevel: -5,
            maxExtent: 60,
            denSigma: 0.42,
            // neither the renderer nor the parent expose the resolved
            // region / map kind here (older addon shape) -> empty strings
            regionResolved: '',
            mapType: '',
            defaults: { alpha: true, siglevel: false, extent: false },
        })
    })

    it('surfaces the resolved region policy and map kind when exposed', () => {
        const parent = { den_sigma: 1, map_type_resolved: 'em' }
        const rend = {
            alpha: 1, extent: 15, siglevel: 1.1, use_abslevel: true,
            maxLevel: 5, minLevel: -5, maxExtent: 100,
            region_mode_resolved: 'full',
            color: { toString: () => '#0000FF' },
            getClientObj: () => parent,
        }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })
        const { state } = getMapRendererState(ctx, { sceneId: 100, rendId: 11 })
        expect(state?.regionResolved).toBe('full')
        expect(state?.mapType).toBe('em')
    })

    it('falls back to denSigma=1 when getClientObj() throws', () => {
        const rend = {
            alpha: 1, extent: 0, siglevel: 0, use_abslevel: false,
            maxLevel: 1, minLevel: -1, maxExtent: 10,
            color: { toString: () => '' },
            getClientObj: () => { throw new Error('no client') },
        }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })
        const { state } = getMapRendererState(ctx, { sceneId: 100, rendId: 11 })
        expect(state?.denSigma).toBe(1)
    })

    it('falls back to color="" when accessing rend.color throws', () => {
        const rend = {
            alpha: 1, extent: 0, siglevel: 0, use_abslevel: false,
            maxLevel: 1, minLevel: -1, maxExtent: 10,
            get color() { throw new Error('no color') },
            getClientObj: () => ({ den_sigma: 1 }),
        }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })
        const { state } = getMapRendererState(ctx, { sceneId: 100, rendId: 11 })
        expect(state?.color).toBe('')
    })
})

// --- setMapRendererProp ---

describe('setMapRendererProp', () => {
    beforeEach(() => vi.clearAllMocks())

    it('numeric props pass through setProp(name, value) inside undo txn', () => {
        const setProp = vi.fn()
        const rend = { setProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'alpha', value: 0.5,
        })
        expect(res).toEqual({ ok: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change map renderer prop')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(setProp).toHaveBeenCalledWith('alpha', 0.5)
        expect(makeColor).not.toHaveBeenCalled()
    })

    it('boolean use_abslevel passes through setProp verbatim', () => {
        const setProp = vi.fn()
        const rend = { setProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'use_abslevel', value: true,
        })
        expect(setProp).toHaveBeenCalledWith('use_abslevel', true)
    })

    it('string colormode passes through setProp inside an undo txn', () => {
        const setProp = vi.fn()
        const rend = { setProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'colormode', value: 'solid',
        })
        expect(res).toEqual({ ok: true })
        expect(setProp).toHaveBeenCalledWith('colormode', 'solid')
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change map renderer prop')
        expect(makeColor).not.toHaveBeenCalled()
    })

    it('"color" path compiles via makeColor and assigns via the typed setter (not setProp)', () => {
        const setProp = vi.fn()
        let colorAssigned: unknown = null
        const rend = {
            setProp,
            get color() { return null },
            set color(v: unknown) { colorAssigned = v },
        }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'color', value: '#00FF00',
        })
        expect(res).toEqual({ ok: true })
        expect(makeColor).toHaveBeenCalledWith(ctx, '#00FF00', scene.uid)
        // Typed setter receives the AbstractColor wrapper -- the wrapper
        // layer unwraps it for the C++ side and fires the PROPCHG that
        // drives the redraw.
        expect(colorAssigned).toEqual({ __color: '#00FF00' })
        expect(setProp).not.toHaveBeenCalled()
    })

    it('returns ok=false when the renderer setter throws', () => {
        const setProp = vi.fn(() => { throw new Error('rejected') })
        const rend = { setProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'extent', value: 30,
        })
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/rejected/) }))
        // The in-txn write threw: roll back, do NOT commit a bogus undo entry.
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('preview writes a numeric prop without an undo txn', () => {
        const setProp = vi.fn()
        const rend = { setProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'alpha', value: 0.5, mode: 'preview',
        })
        expect(res).toEqual({ ok: true })
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
        expect(setProp).toHaveBeenCalledWith('alpha', 0.5)
    })

    it('realtime commit restores the original (txn-free) then commits the final inside the txn', () => {
        const setProp = vi.fn()
        const rend = { setProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'alpha', value: 0.7,
            mode: 'commit', originalValue: 0.2,
        })
        expect(res).toEqual({ ok: true })
        expect(setProp).toHaveBeenNthCalledWith(1, 'alpha', 0.2)
        expect(setProp).toHaveBeenNthCalledWith(2, 'alpha', 0.7)
        expect(scene.startUndoTxn).toHaveBeenCalledTimes(1)
        // The restore precedes opening the txn; the final write happens inside.
        expect(setProp.mock.invocationCallOrder[0]).toBeLessThan(
            scene.startUndoTxn.mock.invocationCallOrder[0],
        )
        expect(setProp.mock.invocationCallOrder[1]).toBeGreaterThan(
            scene.startUndoTxn.mock.invocationCallOrder[0],
        )
    })

    it('realtime commit of a default prop restores via resetProp before the txn', () => {
        const setProp = vi.fn()
        const resetProp = vi.fn()
        const rend = { setProp, resetProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'alpha', value: 0.7,
            mode: 'commit', originalValue: 0.2, originalWasDefault: true,
        })
        expect(res).toEqual({ ok: true })
        expect(resetProp).toHaveBeenCalledWith('alpha')
        expect(setProp).toHaveBeenCalledWith('alpha', 0.7)
        expect(resetProp.mock.invocationCallOrder[0]).toBeLessThan(
            scene.startUndoTxn.mock.invocationCallOrder[0],
        )
        expect(setProp.mock.invocationCallOrder[0]).toBeGreaterThan(
            scene.startUndoTxn.mock.invocationCallOrder[0],
        )
    })

    it('aborts a default prop via resetProp without an undo txn', () => {
        const setProp = vi.fn()
        const resetProp = vi.fn()
        const rend = { setProp, resetProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'alpha', value: 0.2,
            mode: 'abort', originalWasDefault: true,
        })
        expect(res).toEqual({ ok: true })
        expect(resetProp).toHaveBeenCalledWith('alpha')
        expect(setProp).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('aborts a non-default prop via setProp(original) without an undo txn', () => {
        const setProp = vi.fn()
        const resetProp = vi.fn()
        const rend = { setProp, resetProp }
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const ctx = makeCtx({ scene })

        const res = setMapRendererProp(ctx, {
            sceneId: 100, rendId: 11, propName: 'alpha', value: 0.2,
            mode: 'abort', originalWasDefault: false,
        })
        expect(res).toEqual({ ok: true })
        expect(setProp).toHaveBeenCalledWith('alpha', 0.2)
        expect(resetProp).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})

// --- redrawMapCenter ---

describe('redrawMapCenter', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeCenterRend(currentLengthDiff: number) {
        let assigned: unknown = null
        const rend = {
            get center() {
                return {
                    sub: () => ({ length: () => currentLengthDiff }),
                }
            },
            set center(v: unknown) { assigned = v },
        }
        return {
            rend,
            getAssigned: () => assigned,
        }
    }

    it('skips the mutation when the view center is within 0.1 A (moved=false)', () => {
        const { rend, getAssigned } = makeCenterRend(0.05)
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const view = {
            getViewCenter: vi.fn(() => ({ wrapped: { __vec: 'live' } })),
            getScene: vi.fn(() => scene),
        }
        const ctx = makeCtx({ scene, view, viewId: 7 })

        const res = redrawMapCenter(ctx, { sceneId: 100, rendId: 11, viewId: 7 })
        expect(res).toEqual({ ok: true, moved: false })
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
        expect(getAssigned()).toBe(null)
    })

    it('assigns the view-center wrapper under a "Change map renderer center" undo txn', () => {
        const { rend, getAssigned } = makeCenterRend(5)
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const vector = { wrapped: { __vec: 'native' } }
        const view = {
            getViewCenter: vi.fn(() => vector),
            getScene: vi.fn(() => scene),
        }
        const ctx = makeCtx({ scene, view, viewId: 7 })

        const res = redrawMapCenter(ctx, { sceneId: 100, rendId: 11, viewId: 7 })
        expect(res).toEqual({ ok: true, moved: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change map renderer center')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        // Typed setter receives the Vector wrapper itself; wrapper
        // layer unwraps for the C++ side.
        expect(getAssigned()).toBe(vector)
    })

    it('returns ok=false when view is not found', () => {
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => ({}))
        const ctx = makeCtx({ scene, view: null })
        const res = redrawMapCenter(ctx, { sceneId: 100, rendId: 11, viewId: 999 })
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/view/) }))
    })

    it('rolls back without committing when the center setter throws (no moved flag)', () => {
        let threw = false
        const rend = {
            get center() {
                return { sub: () => ({ length: () => 5 }) }
            },
            set center(_v: unknown) {
                threw = true
                throw new Error('center rejected')
            },
        }
        void threw
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => rend)
        const view = {
            getViewCenter: vi.fn(() => ({ wrapped: { __vec: 'native' } })),
            getScene: vi.fn(() => scene),
        }
        const ctx = makeCtx({ scene, view, viewId: 7 })

        const res = redrawMapCenter(ctx, { sceneId: 100, rendId: 11, viewId: 7 })
        // A Fail carries no payload: `moved` is only ever reported on success.
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/center rejected/) }))
        expect(res).not.toHaveProperty('moved')
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})
