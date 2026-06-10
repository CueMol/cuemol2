/**
 * Degrade-detection tests for `lassoSelect` (worker service).
 *
 * Pins the lasso contract:
 *   - the polygon's bounding box drives `view.hitTestRect` for candidates
 *   - candidates are kept only when their projected screen position
 *     (`view.projToScreen`) falls inside the polygon (point-in-polygon)
 *   - kept atom ids are assigned as `aid a,b,...`; Shift (`mode:'add'`) ORs
 *     with the existing selection
 *   - `aid 1:3` ranges are expanded to individual ids
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

function makeMol(opts: { currentSel?: string } = {}) {
    const setSel = vi.fn()
    const cur = opts.currentSel ?? ''
    const mol: Record<string, unknown> = {
        getRendererByType: vi.fn(() => ({})),
        createRenderer: vi.fn(),
        // Atom pos just carries the aid so projToScreen can map it.
        getAtomByID: vi.fn((aid: number) => ({ pos: { _aid: aid } })),
        get sel() {
            return { toString: () => cur }
        },
        set sel(v: unknown) {
            setSel(v)
        },
    }
    return { mol, setSel }
}

/** projMap: aid -> screen point returned by view.projToScreen. */
function makeCtx(hitJson: string, mol: Record<string, unknown>, projMap: Record<number, { x: number; y: number }>) {
    const scene = { uid: 7, getObject: vi.fn(() => mol) }
    const view = {
        hitTestRect: vi.fn(() => hitJson),
        getScene: () => scene,
        projToScreen: vi.fn((pos: { _aid: number }) => projMap[pos._aid] ?? { x: -1, y: -1 }),
    }
    const ctx = { sceMgr: { getView: vi.fn(() => view) } } as unknown as WorkerContext
    return { ctx, view, scene }
}

const ARGS = { viewId: 1, points: SQUARE }

describe('lassoSelect — polygon filtering', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('hit-tests the polygon bounding box', () => {
        const { mol } = makeMol()
        const { ctx, view } = makeCtx('[]', mol, {})
        lassoSelect(ctx, ARGS)
        expect(view.hitTestRect).toHaveBeenCalledWith(0, 0, 10, 10, false)
    })

    it('keeps only candidates whose projection is inside the polygon', () => {
        const { mol, setSel } = makeMol()
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 1,2,3' }])
        const proj = {
            1: { x: 5, y: 5 }, // inside
            2: { x: 50, y: 50 }, // outside
            3: { x: 2, y: 8 }, // inside
        }
        const { ctx } = makeCtx(hits, mol, proj)
        const result = lassoSelect(ctx, ARGS)
        expect(makeSel).toHaveBeenCalledWith(ctx, 'aid 1,3', 7)
        expect(setSel).toHaveBeenCalledWith({ __sel: 'aid 1,3' })
        expect(result).toEqual({ ok: true, selectedObjIds: [1] })
    })

    it('expands aid ranges (a:b) before projecting', () => {
        const { mol } = makeMol()
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 1:3' }])
        const proj = { 1: { x: 1, y: 1 }, 2: { x: 5, y: 5 }, 3: { x: 9, y: 9 } }
        const { ctx } = makeCtx(hits, mol, proj)
        lassoSelect(ctx, ARGS)
        expect(makeSel).toHaveBeenCalledWith(ctx, 'aid 1,2,3', 7)
    })

    it('returns ok=false when no candidate projects inside', () => {
        const { mol, setSel } = makeMol()
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 1,2' }])
        const proj = { 1: { x: 99, y: 99 }, 2: { x: -5, y: -5 } }
        const { ctx } = makeCtx(hits, mol, proj)
        const result = lassoSelect(ctx, ARGS)
        expect(setSel).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, selectedObjIds: [] })
    })

    it('mode=add ORs kept atoms with the existing selection', () => {
        const { mol } = makeMol({ currentSel: 'chain A' })
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 1' }])
        const proj = { 1: { x: 5, y: 5 } }
        const { ctx } = makeCtx(hits, mol, proj)
        lassoSelect(ctx, { ...ARGS, mode: 'add' })
        expect(makeSel).toHaveBeenCalledWith(ctx, '(chain A) or (aid 1)', 7)
    })

    it('rejects a degenerate polygon (< 3 points)', () => {
        const { mol } = makeMol()
        const { ctx, view } = makeCtx('[]', mol, {})
        const result = lassoSelect(ctx, { viewId: 1, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] })
        expect(view.hitTestRect).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, selectedObjIds: [] })
    })
})
