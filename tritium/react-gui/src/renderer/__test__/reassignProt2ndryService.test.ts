/**
 * Degrade-detection tests for `reassignProt2ndry` (worker service backing the
 * UXP "Protein secondary structure" tool dialog, `tools/prot2ndry-tool`).
 *
 * Pins the wire contract:
 *   - recalc -> MolAnlManager.calcProt2ndry2(mol, ignBulge, helixGapAngle) in
 *     a "Recalc protein secondary str" undo txn (no selection compiled).
 *   - assign -> makeSel(selStr) then setProt2ndry(mol, sel, secType) in an
 *     "Assign protein secondary str" undo txn.
 *   - ok=false on missing scene / mol / manager / selection.
 *   - a throwing C++ call rolls back the txn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services } from '@renderer/worker/server/services/molops/molops.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { reassignProt2ndry } = services

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
    sceneId?: number
    molAnlMgr?: unknown
    mol?: unknown
}) {
    const sid = opts.sceneId ?? 100
    const scene = opts.scene ?? makeUndoScene(sid)
    scene.getObject = vi.fn(() => (opts.mol === undefined ? { __mol: true } : opts.mol))
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

describe('reassignProt2ndry', () => {
    beforeEach(() => vi.clearAllMocks())

    it('recalc: calls calcProt2ndry2(mol, ignBulge, angle) in a "Recalc ..." txn, no selection', () => {
        const mol = { __mol: true }
        const calcProt2ndry2 = vi.fn()
        const setProt2ndry = vi.fn()
        const { ctx, scene } = makeCtx({ mol, molAnlMgr: { calcProt2ndry2, setProt2ndry } })

        const res = reassignProt2ndry(ctx, {
            sceneId: 100, objId: 7, mode: 'recalc', ignBulge: true, helixGapAngle: 120,
        })

        expect(res).toEqual({ ok: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Recalc protein secondary str')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(calcProt2ndry2).toHaveBeenCalledWith(mol, true, 120)
        expect(makeSel).not.toHaveBeenCalled()
        expect(setProt2ndry).not.toHaveBeenCalled()
    })

    it('recalc: defaults ignBulge=false and angle=0 when omitted', () => {
        const calcProt2ndry2 = vi.fn()
        const { ctx } = makeCtx({ molAnlMgr: { calcProt2ndry2, setProt2ndry: vi.fn() } })

        reassignProt2ndry(ctx, { sceneId: 100, objId: 7, mode: 'recalc' })

        expect(calcProt2ndry2).toHaveBeenCalledWith({ __mol: true }, false, 0)
    })

    it('assign: compiles selection and calls setProt2ndry(mol, sel, secType) in an "Assign ..." txn', () => {
        const mol = { __mol: true }
        const setProt2ndry = vi.fn()
        const { ctx, scene } = makeCtx({ mol, molAnlMgr: { calcProt2ndry2: vi.fn(), setProt2ndry } })

        const res = reassignProt2ndry(ctx, {
            sceneId: 100, objId: 7, mode: 'assign', selStr: 'chain A', secType: 2,
        })

        expect(res).toEqual({ ok: true })
        expect(makeSel).toHaveBeenCalledWith(ctx, 'chain A', 100)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Assign protein secondary str')
        expect(setProt2ndry).toHaveBeenCalledWith(mol, { __sel: true }, 2)
    })

    it('assign: ok=false when the selection fails to compile', () => {
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const setProt2ndry = vi.fn()
        const { ctx } = makeCtx({ molAnlMgr: { calcProt2ndry2: vi.fn(), setProt2ndry } })

        const res = reassignProt2ndry(ctx, {
            sceneId: 100, objId: 7, mode: 'assign', selStr: 'bogus(', secType: 1,
        })

        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/selection/)
        expect(setProt2ndry).not.toHaveBeenCalled()
    })

    it('ok=false when the molecule is missing', () => {
        const { ctx } = makeCtx({ mol: null, molAnlMgr: { calcProt2ndry2: vi.fn(), setProt2ndry: vi.fn() } })
        const res = reassignProt2ndry(ctx, { sceneId: 100, objId: 999, mode: 'recalc' })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/molecule/)
    })

    it('ok=false when MolAnlManager is unavailable', () => {
        const { ctx } = makeCtx({ molAnlMgr: null })
        const res = reassignProt2ndry(ctx, { sceneId: 100, objId: 7, mode: 'recalc' })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/MolAnlManager/)
    })

    it('rolls back when the C++ call throws', () => {
        const calcProt2ndry2 = vi.fn(() => { throw new Error('boom') })
        const { ctx, scene } = makeCtx({ molAnlMgr: { calcProt2ndry2, setProt2ndry: vi.fn() } })

        const res = reassignProt2ndry(ctx, { sceneId: 100, objId: 7, mode: 'recalc' })

        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/boom/)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})
