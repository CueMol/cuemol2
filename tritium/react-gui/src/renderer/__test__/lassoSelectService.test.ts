/**
 * Degrade-detection tests for `lassoSelect` (worker service).
 *
 * The polygon math now lives in C++ (View.hitTestPolygon); the service only
 * marshals: interleave the vertices into a FLOAT32 ByteArray, call
 * hitTestPolygon, then run the shared selection tail (group by obj_id, assign
 * sel, single undo txn). These tests pin that wiring. The point-in-polygon
 * filtering itself is covered by the C++ gtest + host E2E.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, selStr: string) => ({ __sel: selStr })),
}))
vi.mock('../worker/server/services/withUndoTxn', () => ({
    withUndoTxn: vi.fn((_scene: unknown, _label: string, fn: () => unknown) => fn()),
}))

import { services } from '../worker/server/services/lassoSelect.service'
import { makeSel } from '../worker/server/services/helpers/makeSel'

const { lassoSelect } = services

// Square polygon (0,0)-(10,10).
const SQUARE = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
]

function makeMol(opts: { hasSelRend?: boolean; currentSel?: string } = {}) {
    const setSel = vi.fn()
    const createRenderer = vi.fn()
    const cur = opts.currentSel ?? ''
    const mol: Record<string, unknown> = {
        getRendererByType: vi.fn(() => (opts.hasSelRend ? {} : null)),
        createRenderer,
        get sel() {
            return { toString: () => cur }
        },
        set sel(v: unknown) {
            setSel(v)
        },
    }
    return { mol, setSel, createRenderer }
}

// Sentinel returned by fromTypedArray, so we can assert it reaches hitTestPolygon.
const BYTE_ARRAY = { __byteArray: true }

function makeCtx(hitJson: string, mols: Record<number, Record<string, unknown>>) {
    const scene = { uid: 7, getObject: vi.fn((id: number) => mols[id] ?? null) }
    const view = {
        hitTestPolygon: vi.fn((_ba: unknown, _nr: boolean) => hitJson),
        getScene: () => scene,
    }
    const fromTypedArray = vi.fn((_a: unknown) => BYTE_ARRAY)
    const ctx = {
        sceMgr: { getView: vi.fn(() => view) },
        svc: { fromTypedArray },
    } as unknown as WorkerContext
    return { ctx, view, scene, fromTypedArray }
}

const ARGS = { viewId: 1, points: SQUARE }

describe('lassoSelect — polygon hit test wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('passes the interleaved FLOAT32 vertices to hitTestPolygon as a ByteArray', () => {
        const { mol } = makeMol()
        const { ctx, view, fromTypedArray } = makeCtx('[]', { 1: mol })
        lassoSelect(ctx, ARGS)
        expect(fromTypedArray).toHaveBeenCalledTimes(1)
        const passed = fromTypedArray.mock.calls[0][0]
        expect(passed).toBeInstanceOf(Float32Array)
        expect(Array.from(passed as Float32Array)).toEqual([0, 0, 10, 0, 10, 10, 0, 10])
        expect(view.hitTestPolygon).toHaveBeenCalledWith(BYTE_ARRAY, false)
    })

    it('groups hits by obj_id and assigns each mol.sel', () => {
        const m1 = makeMol({ hasSelRend: true })
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 1,3' }])
        const { ctx } = makeCtx(hits, { 1: m1.mol })
        const result = lassoSelect(ctx, ARGS)
        expect(makeSel).toHaveBeenCalledWith(ctx, 'aid 1,3', 7)
        expect(m1.setSel).toHaveBeenCalledWith({ __sel: 'aid 1,3' })
        expect(result).toEqual({ ok: true, selectedObjIds: [1] })
    })

    it('auto-creates the *selection renderer when missing', () => {
        const without = makeMol({ hasSelRend: false })
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 1' }])
        const { ctx } = makeCtx(hits, { 1: without.mol })
        lassoSelect(ctx, ARGS)
        expect(without.createRenderer).toHaveBeenCalledWith('*selection')
    })

    it('mode=add ORs the polygon hits with the existing selection', () => {
        const m1 = makeMol({ hasSelRend: true, currentSel: 'chain A' })
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 1' }])
        const { ctx } = makeCtx(hits, { 1: m1.mol })
        lassoSelect(ctx, { ...ARGS, mode: 'add' })
        expect(makeSel).toHaveBeenCalledWith(ctx, '(chain A) or (aid 1)', 7)
    })

    it('rejects a degenerate polygon (< 3 points) before any hit test', () => {
        const { mol } = makeMol()
        const { ctx, view, fromTypedArray } = makeCtx('[]', { 1: mol })
        const result = lassoSelect(ctx, { viewId: 1, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] })
        expect(fromTypedArray).not.toHaveBeenCalled()
        expect(view.hitTestPolygon).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, selectedObjIds: [] })
    })

    it('returns ok=false on empty hit results', () => {
        const { mol, setSel } = makeMol()
        const { ctx } = makeCtx('[]', { 1: mol })
        const result = lassoSelect(ctx, ARGS)
        expect(setSel).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, selectedObjIds: [] })
    })

    it('returns ok=false on unparsable hit JSON', () => {
        const { mol, setSel } = makeMol()
        const { ctx } = makeCtx('not-json', { 1: mol })
        const result = lassoSelect(ctx, ARGS)
        expect(setSel).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, selectedObjIds: [] })
    })
})
