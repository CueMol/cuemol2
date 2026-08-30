/**
 * Degrade-detection tests for `rectSelect` (worker service).
 *
 * Pins the UXP `rectSel()` parity contract:
 *   - `view.hitTestRect(left, top, width, height, false)` drives the hit test
 *     (bNearest=false -> all hits inside the rectangle)
 *   - hits are grouped by `obj_id` and their `sel` strings joined with `|`
 *     before being assigned to each molecule's `sel`
 *   - the `*selection` renderer is auto-created when missing
 *   - empty / unparsable hit results leave selections untouched
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, selStr: string) => ({ __sel: selStr })),
}))
vi.mock('@renderer/worker/server/services/withUndoTxn', () => ({
    withUndoTxn: vi.fn((_scene: unknown, _label: string, fn: () => unknown) => fn()),
}))

import { services } from '@renderer/worker/server/services/rectSelect.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { rectSelect } = services

interface MolFixture {
    mol: Record<string, unknown>
    setSel: ReturnType<typeof vi.fn>
    createRenderer: ReturnType<typeof vi.fn>
}

function makeMol(opts: { hasSelRend?: boolean; currentSel?: string } = {}): MolFixture {
    const setSel = vi.fn()
    const createRenderer = vi.fn()
    const cur = opts.currentSel ?? ''
    const mol: Record<string, unknown> = {
        getRendererByType: vi.fn((_t: string) => (opts.hasSelRend ? {} : null)),
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

function makeCtx(hitJson: string, mols: Record<number, Record<string, unknown>>) {
    const scene = {
        uid: 99,
        getObject: vi.fn((id: number) => mols[id] ?? null),
    }
    const view = {
        hitTestRect: vi.fn(() => hitJson),
        getScene: () => scene,
    }
    const ctx = {
        sceMgr: { getView: vi.fn(() => view) },
    } as unknown as WorkerContext
    return { ctx, view, scene }
}

const ARGS = { viewId: 1, left: 10, top: 20, width: 100, height: 80 }

describe('rectSelect — UXP rectSel parity', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('calls hitTestRect with the rectangle bounds and bNearest=false', () => {
        const { ctx, view } = makeCtx('[]', {})
        rectSelect(ctx, ARGS)
        expect(view.hitTestRect).toHaveBeenCalledWith(10, 20, 100, 80, false)
    })

    it('groups hits by obj_id, joins sel with "|", and assigns each mol.sel', () => {
        const m1 = makeMol({ hasSelRend: true })
        const m2 = makeMol({ hasSelRend: true })
        const hits = JSON.stringify([
            { obj_id: 1, sel: 'A' },
            { obj_id: 1, sel: 'B' },
            { obj_id: 2, sel: 'C' },
        ])
        const { ctx } = makeCtx(hits, { 1: m1.mol, 2: m2.mol })

        const result = rectSelect(ctx, ARGS)

        expect(makeSel).toHaveBeenCalledWith(ctx, 'A|B', 99)
        expect(makeSel).toHaveBeenCalledWith(ctx, 'C', 99)
        expect(m1.setSel).toHaveBeenCalledWith({ __sel: 'A|B' })
        expect(m2.setSel).toHaveBeenCalledWith({ __sel: 'C' })
        expect(result).toEqual({ ok: true, selectedObjIds: [1, 2] })
    })

    it('auto-creates the *selection renderer only when missing', () => {
        const withRend = makeMol({ hasSelRend: true })
        const without = makeMol({ hasSelRend: false })
        const hits = JSON.stringify([
            { obj_id: 1, sel: 'A' },
            { obj_id: 2, sel: 'B' },
        ])
        const { ctx } = makeCtx(hits, { 1: withRend.mol, 2: without.mol })

        rectSelect(ctx, ARGS)

        expect(withRend.createRenderer).not.toHaveBeenCalled()
        expect(without.createRenderer).toHaveBeenCalledWith('*selection')
    })

    it('returns ok=false and touches no selection on empty hit results', () => {
        const m1 = makeMol({ hasSelRend: true })
        const { ctx } = makeCtx('[]', { 1: m1.mol })
        const result = rectSelect(ctx, ARGS)
        expect(m1.setSel).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, selectedObjIds: [] })
    })

    it('returns ok=false on unparsable hit JSON', () => {
        const m1 = makeMol({ hasSelRend: true })
        const { ctx } = makeCtx('not-json', { 1: m1.mol })
        const result = rectSelect(ctx, ARGS)
        expect(m1.setSel).not.toHaveBeenCalled()
        expect(result).toEqual({ ok: false, selectedObjIds: [] })
    })

    it('mode=add ORs the rectangle hits with the existing selection', () => {
        const m1 = makeMol({ hasSelRend: true, currentSel: 'chain A' })
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 5-7' }])
        const { ctx } = makeCtx(hits, { 1: m1.mol })
        rectSelect(ctx, { ...ARGS, mode: 'add' })
        expect(makeSel).toHaveBeenCalledWith(ctx, '(chain A) or (aid 5-7)', 99)
    })

    it('mode=add with no existing selection uses the new selection alone', () => {
        const m1 = makeMol({ hasSelRend: true, currentSel: '' })
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 5-7' }])
        const { ctx } = makeCtx(hits, { 1: m1.mol })
        rectSelect(ctx, { ...ARGS, mode: 'add' })
        expect(makeSel).toHaveBeenCalledWith(ctx, 'aid 5-7', 99)
    })

    it('default mode replaces (does not read the existing selection)', () => {
        const m1 = makeMol({ hasSelRend: true, currentSel: 'chain A' })
        const hits = JSON.stringify([{ obj_id: 1, sel: 'aid 5-7' }])
        const { ctx } = makeCtx(hits, { 1: m1.mol })
        rectSelect(ctx, ARGS)
        expect(makeSel).toHaveBeenCalledWith(ctx, 'aid 5-7', 99)
    })
})
