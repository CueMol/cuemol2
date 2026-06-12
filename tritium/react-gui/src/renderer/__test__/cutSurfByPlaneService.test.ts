/**
 * Degrade-detection tests for `cutSurfByPlane` (worker service backing the UXP
 * "MolSurf cutting tool" dialog, `tools/surf-cutbyplane`).
 *
 * Pins the wire contract:
 *   - derives the clip plane from the view: rotation.conjugate().toMatrix()
 *     .mulvec(+Z), center = view.center + normal*(slab/2), normal flipped
 *   - mode -> (keepBody, keepSection) flags passed to cutByPlane2
 *   - "separate" mode clones the surface via StreamManager (toXML/fromXML),
 *     names it sect_<base>, adds it, and cuts body vs section into two objects
 *   - density coerced to >= 0.1 (default 5.0)
 *   - all mutations run inside a "Cut surface by plane" undo txn; a throw rolls
 *     back
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

import { services } from '../worker/server/services/cutSurfByPlane.service'

const { cutSurfByPlane } = services

// Marker vectors so we can assert the plane math wiring by identity.
const NORM_ROT = { __v: 'rot', scale: vi.fn() }
const NORM_SCALED_HALF = { __v: 'scaledHalf' }
const NORM_FLIPPED = { __v: 'flipped' }
const VIEW_CENTER = { __v: 'center', add: vi.fn() }
const PLANE_CENTER = { __v: 'planeCenter' }

function wireVectors() {
    // normal starts as NORM_Z (from createObj+set4), becomes NORM_ROT after
    // mulvec; NORM_ROT.scale(slab/2) -> NORM_SCALED_HALF, NORM_ROT.scale(-1) ->
    // NORM_FLIPPED; view.center.add(NORM_SCALED_HALF) -> PLANE_CENTER.
    NORM_ROT.scale = vi.fn((s: number) =>
        s < 0 ? NORM_FLIPPED : NORM_SCALED_HALF,
    )
    VIEW_CENTER.add = vi.fn(() => PLANE_CENTER)
}

function makeView(slab: number) {
    const matrix = { mulvec: vi.fn(() => NORM_ROT) }
    const quat = { conjugate: vi.fn(() => ({ toMatrix: vi.fn(() => matrix) })) }
    return {
        slab,
        rotation: quat,
        center: VIEW_CENTER,
    }
}

function makeCtx(opts: {
    tgt?: any
    view?: any
    cloneObj?: any
    cloneXml?: string | null
    existingNames?: string[]
    sceneId?: number
    viewId?: number
}) {
    const sid = opts.sceneId ?? 100
    const vid = opts.viewId ?? 7
    const names = new Set(opts.existingNames ?? [])
    const scene = {
        uid: sid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn((id: number) => (id === 1 ? opts.tgt ?? null : null)),
        getObjectByName: vi.fn((n: string) => (names.has(n) ? {} : null)),
        addObject: vi.fn(),
    }
    const view = opts.view ?? makeView(10)
    const strMgr = {
        toXML: vi.fn(() => opts.cloneXml ?? '<xml/>'),
        fromXML: vi.fn(() => opts.cloneObj ?? null),
    }
    const ctx = {
        sceMgr: {
            getScene: vi.fn((id: number) => (id === sid ? scene : null)),
            getView: vi.fn((id: number) => (id === vid ? view : null)),
        },
        svc: {
            createObj: vi.fn(() => ({
                __v: 'z',
                set4: vi.fn(),
            })),
        },
        strMgr,
    } as unknown as WorkerContext
    return { ctx, scene, view, strMgr }
}

function makeSurf(uid: number, name = 'surf1') {
    return { uid, name, cutByPlane2: vi.fn() }
}

const BASE = { sceneId: 100, viewId: 7, objId: 1, mode: 'full' as const, density: 5 }

describe('cutSurfByPlane', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        wireVectors()
    })

    it('full mode: cuts the target with (body=true, sect=true) in one txn', () => {
        const tgt = makeSurf(11)
        const { ctx, scene, view } = makeCtx({ tgt })

        const res = cutSurfByPlane(ctx, { ...BASE, mode: 'full' })

        expect(res.ok).toBe(true)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Cut surface by plane')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        // plane math wiring
        expect(view.rotation.conjugate).toHaveBeenCalled()
        expect(VIEW_CENTER.add).toHaveBeenCalledWith(NORM_SCALED_HALF)
        // cutByPlane2(density, flippedNormal, planeCenter, body, sect)
        expect(tgt.cutByPlane2).toHaveBeenCalledWith(5, NORM_FLIPPED, PLANE_CENTER, true, true)
    })

    it('sect mode -> (body=false, sect=true)', () => {
        const tgt = makeSurf(11)
        const { ctx } = makeCtx({ tgt })
        cutSurfByPlane(ctx, { ...BASE, mode: 'sect' })
        expect(tgt.cutByPlane2).toHaveBeenCalledWith(5, NORM_FLIPPED, PLANE_CENTER, false, true)
    })

    it('body mode -> (body=true, sect=false)', () => {
        const tgt = makeSurf(11)
        const { ctx } = makeCtx({ tgt })
        cutSurfByPlane(ctx, { ...BASE, mode: 'body' })
        expect(tgt.cutByPlane2).toHaveBeenCalledWith(5, NORM_FLIPPED, PLANE_CENTER, true, false)
    })

    it('separate mode: clones, names sect_<base>, adds, cuts body and section', () => {
        const tgt = makeSurf(11, 'mysurf')
        const sect = makeSurf(22, '')
        const { ctx, scene, strMgr } = makeCtx({ tgt, cloneObj: sect })

        const res = cutSurfByPlane(ctx, { ...BASE, mode: 'separate' })

        expect(res.ok).toBe(true)
        expect(res.sectObjId).toBe(22)
        expect(strMgr.toXML).toHaveBeenCalledWith(tgt)
        expect(strMgr.fromXML).toHaveBeenCalledWith('<xml/>', 100)
        expect(sect.name).toBe('sect_mysurf')
        expect(scene.addObject).toHaveBeenCalledWith(sect)
        // section obj keeps only section, target keeps only body
        expect(sect.cutByPlane2).toHaveBeenCalledWith(5, NORM_FLIPPED, PLANE_CENTER, false, true)
        expect(tgt.cutByPlane2).toHaveBeenCalledWith(5, NORM_FLIPPED, PLANE_CENTER, true, false)
    })

    it('separate mode: appends a numeric suffix when sect_<base> is taken', () => {
        const tgt = makeSurf(11, 'mysurf')
        const sect = makeSurf(22, '')
        const { ctx } = makeCtx({ tgt, cloneObj: sect, existingNames: ['sect_mysurf'] })
        cutSurfByPlane(ctx, { ...BASE, mode: 'separate' })
        expect(sect.name).toBe('sect1_mysurf')
    })

    it('coerces density < 0.1 to 5.0', () => {
        const tgt = makeSurf(11)
        const { ctx } = makeCtx({ tgt })
        cutSurfByPlane(ctx, { ...BASE, density: 0 })
        expect(tgt.cutByPlane2).toHaveBeenCalledWith(5, NORM_FLIPPED, PLANE_CENTER, true, true)
    })

    it('rolls back the txn when cutByPlane2 throws', () => {
        const tgt = makeSurf(11)
        tgt.cutByPlane2.mockImplementation(() => {
            throw new Error('boom')
        })
        const { ctx, scene } = makeCtx({ tgt })
        const res = cutSurfByPlane(ctx, { ...BASE })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/boom/)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok=false when the surface object is missing', () => {
        const { ctx } = makeCtx({ tgt: null })
        const res = cutSurfByPlane(ctx, { ...BASE })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/surface object/)
    })

    it('returns ok=false when the view is missing', () => {
        const tgt = makeSurf(11)
        const { ctx } = makeCtx({ tgt, view: null })
        // view lookup returns null for any id since we passed null
        ;(ctx.sceMgr as any).getView = vi.fn(() => null)
        const res = cutSurfByPlane(ctx, { ...BASE })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/view/)
    })
})
