/**
 * Degrade-detection tests for `mergeMol` (worker service backing the UXP
 * "Merge molecule" tool dialog, `tools/mol_merge`).
 *
 * Pins the wire contract:
 *   - compiles the selection via `makeSel(ctx, selStr, scene.uid)`
 *   - copy=true  -> copyAtoms(toMol, fromMol, sel) only (no delete)
 *   - copy=false -> copyAtoms(...) then deleteAtoms(fromMol, sel) (move)
 *     both inside a single "Merge molecule" undo txn
 *   - copyAtoms arg order is (destination, source, selection)
 *   - same source/destination is rejected
 *   - a failed/throwing step rolls back the whole txn
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services } from '@renderer/worker/server/services/molops/molops.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { mergeMol } = services

function makeUndoScene(uid: number) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(),
    }
}

function makeCtx(opts: {
    scene?: ReturnType<typeof makeUndoScene> | null
    objects?: Record<number, unknown>
    molAnlMgr?: unknown
    sceneId?: number
}) {
    const sid = opts.sceneId ?? 100
    const scene = opts.scene ?? makeUndoScene(sid)
    if (opts.objects) {
        scene.getObject = vi.fn((id: number) => opts.objects?.[id] ?? null)
    }
    return {
        ctx: {
            sceMgr: { getScene: vi.fn((id: number) => (id === sid ? scene : null)) },
            svc: {
                getService: vi.fn((name: string) =>
                    name === 'MolAnlManager' ? opts.molAnlMgr ?? null : null,
                ),
            },
        } as unknown as WorkerContext,
        scene,
    }
}

const SEL = { __sel: true }

describe('mergeMol', () => {
    beforeEach(() => vi.clearAllMocks())

    it('copy=true: calls copyAtoms(toMol, fromMol, sel) and does not delete', () => {
        const fromMol = { __from: true }
        const toMol = { __to: true }
        const copyAtoms = vi.fn(() => true)
        const deleteAtoms = vi.fn(() => true)
        const { ctx, scene } = makeCtx({
            objects: { 1: fromMol, 2: toMol },
            molAnlMgr: { copyAtoms, deleteAtoms },
        })

        const res = mergeMol(ctx, {
            sceneId: 100, fromObjId: 1, toObjId: 2, selStr: 'chain A', copy: true,
        })

        expect(res).toEqual({ ok: true })
        expect(makeSel).toHaveBeenCalledWith(ctx, 'chain A', 100)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Merge molecule')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        // destination first, then source, then selection
        expect(copyAtoms).toHaveBeenCalledWith(toMol, fromMol, SEL)
        expect(deleteAtoms).not.toHaveBeenCalled()
    })

    it('copy=false (move): copies then deletes the source atoms', () => {
        const fromMol = { __from: true }
        const toMol = { __to: true }
        const copyAtoms = vi.fn(() => true)
        const deleteAtoms = vi.fn(() => true)
        const { ctx } = makeCtx({
            objects: { 1: fromMol, 2: toMol },
            molAnlMgr: { copyAtoms, deleteAtoms },
        })

        const res = mergeMol(ctx, {
            sceneId: 100, fromObjId: 1, toObjId: 2, selStr: 'chain A', copy: false,
        })

        expect(res).toEqual({ ok: true })
        expect(copyAtoms).toHaveBeenCalledWith(toMol, fromMol, SEL)
        expect(deleteAtoms).toHaveBeenCalledWith(fromMol, SEL)
    })

    it('rejects merging a molecule into itself', () => {
        const { ctx } = makeCtx({
            objects: { 1: { __m: true } },
            molAnlMgr: { copyAtoms: vi.fn(), deleteAtoms: vi.fn() },
        })
        const res = mergeMol(ctx, {
            sceneId: 100, fromObjId: 1, toObjId: 1, selStr: '*', copy: true,
        })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/differ/)
    })

    it('rolls back the whole txn when deleteAtoms fails during a move', () => {
        const copyAtoms = vi.fn(() => true)
        const deleteAtoms = vi.fn(() => false)
        const { ctx, scene } = makeCtx({
            objects: { 1: { __from: true }, 2: { __to: true } },
            molAnlMgr: { copyAtoms, deleteAtoms },
        })

        const res = mergeMol(ctx, {
            sceneId: 100, fromObjId: 1, toObjId: 2, selStr: '*', copy: false,
        })

        expect(res.ok).toBe(false)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok=false without touching the manager when the selection fails to compile', () => {
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const copyAtoms = vi.fn()
        const { ctx } = makeCtx({
            objects: { 1: { __from: true }, 2: { __to: true } },
            molAnlMgr: { copyAtoms, deleteAtoms: vi.fn() },
        })
        const res = mergeMol(ctx, {
            sceneId: 100, fromObjId: 1, toObjId: 2, selStr: 'bogus(', copy: true,
        })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/selection/)
        expect(copyAtoms).not.toHaveBeenCalled()
    })

    it('returns ok=false when a molecule is missing', () => {
        const { ctx } = makeCtx({
            objects: { 1: { __from: true } },
            molAnlMgr: { copyAtoms: vi.fn(), deleteAtoms: vi.fn() },
        })
        const res = mergeMol(ctx, {
            sceneId: 100, fromObjId: 1, toObjId: 2, selStr: '*', copy: true,
        })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/destination molecule/)
    })
})
