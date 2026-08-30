/**
 * Degrade-detection tests for `viewXform` (worker service backing `ViewPane`,
 * the UXP `panel.fakedial` port).
 *
 * Pins the wire contract:
 *   - getViewXform reads view.zoom / slab / distance and center.{x,y,z}
 *   - setViewXform writes ONLY the fields present in args
 *   - zoom is clamped to >= 0.01, slab / distance to >= 0
 *   - center builds a fresh Vector (via svc.createObj) and assigns view.center
 *   - rotateView forwards (rotX, rotY, rotZ) to view.rotateView (relative)
 *   - translateView forwards (dx, dy, dz) to view.translateViewDrag (dragging)
 *     or view.translateView (commit) and returns the resulting center
 *   - missing view -> { ok: false }
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from '@renderer/worker/server/services/view/view.service'

const { getViewXform, setViewXform, rotateView, translateView } = services

function makeView() {
    const setZoom = vi.fn()
    const setSlab = vi.fn()
    const setDistance = vi.fn()
    const setCenter = vi.fn()
    const rotateViewSpy = vi.fn()
    const translateViewSpy = vi.fn()
    const translateViewDragSpy = vi.fn()
    const center = { x: 1, y: 2, z: 3 }
    const view = {
        get zoom() {
            return 50
        },
        set zoom(v: number) {
            setZoom(v)
        },
        get slab() {
            return 100
        },
        set slab(v: number) {
            setSlab(v)
        },
        get distance() {
            return 120
        },
        set distance(v: number) {
            setDistance(v)
        },
        get center() {
            return center
        },
        set center(v: unknown) {
            setCenter(v)
        },
        rotateView: rotateViewSpy,
        translateView: translateViewSpy,
        translateViewDrag: translateViewDragSpy,
    }
    return {
        view,
        setZoom,
        setSlab,
        setDistance,
        setCenter,
        rotateViewSpy,
        translateViewSpy,
        translateViewDragSpy,
    }
}

function makeCtx(view: unknown, createdVec?: unknown): WorkerContext {
    const vec = createdVec ?? { x: 0, y: 0, z: 0 }
    return {
        sceMgr: { getView: vi.fn(() => view) },
        svc: { createObj: vi.fn(() => vec) },
    } as unknown as WorkerContext
}

describe('viewXform.getViewXform', () => {
    it('reads zoom/slab/distance and center components', () => {
        const { view } = makeView()
        const res = getViewXform(makeCtx(view), { viewId: 7 })
        expect(res).toEqual({
            ok: true,
            zoom: 50,
            slab: 100,
            distance: 120,
            centerX: 1,
            centerY: 2,
            centerZ: 3,
        })
    })

    it('returns ok:false when the view is missing', () => {
        const res = getViewXform(makeCtx(null), { viewId: 7 })
        expect(res.ok).toBe(false)
    })
})

describe('viewXform.setViewXform', () => {
    it('writes only the fields present in args', () => {
        const { view, setZoom, setSlab, setDistance, setCenter } = makeView()
        setViewXform(makeCtx(view), { viewId: 7, slab: 80 })
        expect(setSlab).toHaveBeenCalledWith(80)
        expect(setZoom).not.toHaveBeenCalled()
        expect(setDistance).not.toHaveBeenCalled()
        expect(setCenter).not.toHaveBeenCalled()
    })

    it('clamps zoom to >= 0.01 and slab/distance to >= 0', () => {
        const { view, setZoom, setSlab, setDistance } = makeView()
        const ctx = makeCtx(view)
        setViewXform(ctx, { viewId: 7, zoom: -5 })
        setViewXform(ctx, { viewId: 7, slab: -10 })
        setViewXform(ctx, { viewId: 7, distance: -1 })
        expect(setZoom).toHaveBeenCalledWith(0.01)
        expect(setSlab).toHaveBeenCalledWith(0)
        expect(setDistance).toHaveBeenCalledWith(0)
    })

    it('passes in-range zoom through unclamped', () => {
        const { view, setZoom } = makeView()
        setViewXform(makeCtx(view), { viewId: 7, zoom: 25 })
        expect(setZoom).toHaveBeenCalledWith(25)
    })

    it('builds a fresh Vector for center and assigns view.center', () => {
        const vec = { x: 0, y: 0, z: 0 }
        const { view, setCenter } = makeView()
        const ctx = makeCtx(view, vec)
        setViewXform(ctx, { viewId: 7, center: { x: 4, y: 5, z: 6 } })
        expect(ctx.svc.createObj).toHaveBeenCalledWith('Vector')
        expect(vec).toEqual({ x: 4, y: 5, z: 6 })
        expect(setCenter).toHaveBeenCalledWith(vec)
    })

    it('returns ok:false when the view is missing', () => {
        expect(setViewXform(makeCtx(null), { viewId: 7, zoom: 10 }).ok).toBe(false)
    })
})

describe('viewXform.rotateView', () => {
    it('forwards a relative rotation to view.rotateView', () => {
        const { view, rotateViewSpy } = makeView()
        rotateView(makeCtx(view), { viewId: 7, rotX: 10, rotY: 0, rotZ: -5 })
        expect(rotateViewSpy).toHaveBeenCalledWith(10, 0, -5)
    })

    it('returns ok:false when the view is missing', () => {
        expect(rotateView(makeCtx(null), { viewId: 7, rotX: 1, rotY: 0, rotZ: 0 }).ok).toBe(false)
    })
})

describe('viewXform.translateView', () => {
    it('uses translateViewDrag mid-drag and returns the resulting center', () => {
        const { view, translateViewSpy, translateViewDragSpy } = makeView()
        const res = translateView(makeCtx(view), {
            viewId: 7,
            dx: 5,
            dy: 0,
            dz: 0,
            dragging: true,
        })
        expect(translateViewDragSpy).toHaveBeenCalledWith(5, 0, 0)
        expect(translateViewSpy).not.toHaveBeenCalled()
        expect(res).toEqual({ ok: true, centerX: 1, centerY: 2, centerZ: 3 })
    })

    it('uses the committing translateView when dragging is false', () => {
        const { view, translateViewSpy, translateViewDragSpy } = makeView()
        translateView(makeCtx(view), { viewId: 7, dx: 0, dy: -3, dz: 0, dragging: false })
        expect(translateViewSpy).toHaveBeenCalledWith(0, -3, 0)
        expect(translateViewDragSpy).not.toHaveBeenCalled()
    })

    it('defaults to the drag variant when dragging is omitted', () => {
        const { view, translateViewDragSpy } = makeView()
        translateView(makeCtx(view), { viewId: 7, dx: 0, dy: 0, dz: 2 })
        expect(translateViewDragSpy).toHaveBeenCalledWith(0, 0, 2)
    })

    it('returns ok:false when the view is missing', () => {
        expect(
            translateView(makeCtx(null), { viewId: 7, dx: 1, dy: 0, dz: 0, dragging: true }).ok,
        ).toBe(false)
    })
})
