/**
 * Degrade-detection tests for `changeResidueIndex` (worker service backing the
 * UXP "Change residue index" tool dialog, `tools/chg_resindex`).
 *
 * Pins the wire contract:
 *   - compiles the selection via `makeSel(ctx, selStr, scene.uid)`
 *   - renumber=true  -> MolAnlManager.renumResIndex(mol, sel, bshift, value)
 *   - renumber=false -> MolAnlManager.shiftResIndex(mol, sel, bshift, value)
 *     both inside a "Change residue index" undo txn
 *   - ok=false on selection-compile failure / missing manager / missing mol
 *   - ok=false when the underlying call returns false / throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services } from '@renderer/worker/server/services/changeResidueIndex.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { changeResidueIndex } = services

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
}) {
    const sid = opts.sceneId ?? 100
    return {
        sceMgr: {
            getScene: vi.fn((id: number) => (id === sid ? opts.scene ?? null : null)),
        },
        svc: {
            getService: vi.fn((name: string) =>
                name === 'MolAnlManager' ? opts.molAnlMgr ?? null : null,
            ),
        },
    } as unknown as WorkerContext
}

const BASE = { sceneId: 100, objId: 42, selStr: 'chain A' }

describe('changeResidueIndex', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls shiftResIndex(mol, sel, bshift, value) when renumber is off, in a "Change residue index" undo txn', () => {
        const scene = makeUndoScene(100)
        const mol = { __mol: true }
        scene.getObject = vi.fn(() => mol)
        const shiftResIndex = vi.fn(() => true)
        const renumResIndex = vi.fn(() => true)
        const ctx = makeCtx({ scene, molAnlMgr: { shiftResIndex, renumResIndex } })

        const res = changeResidueIndex(ctx, {
            ...BASE, bshift: true, value: 5, renumber: false,
        })

        expect(res).toEqual({ ok: true })
        expect(makeSel).toHaveBeenCalledWith(ctx, 'chain A', 100)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change residue index')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(shiftResIndex).toHaveBeenCalledWith(mol, { __sel: true }, true, 5)
        expect(renumResIndex).not.toHaveBeenCalled()
    })

    it('calls renumResIndex when renumber is on, forwarding bshift=false (start mode)', () => {
        const scene = makeUndoScene(100)
        const mol = { __mol: true }
        scene.getObject = vi.fn(() => mol)
        const shiftResIndex = vi.fn(() => true)
        const renumResIndex = vi.fn(() => true)
        const ctx = makeCtx({ scene, molAnlMgr: { shiftResIndex, renumResIndex } })

        const res = changeResidueIndex(ctx, {
            ...BASE, bshift: false, value: 100, renumber: true,
        })

        expect(res).toEqual({ ok: true })
        expect(renumResIndex).toHaveBeenCalledWith(mol, { __sel: true }, false, 100)
        expect(shiftResIndex).not.toHaveBeenCalled()
    })

    it('returns ok=false without touching the manager when the selection fails to compile', () => {
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const shiftResIndex = vi.fn()
        const ctx = makeCtx({ scene, molAnlMgr: { shiftResIndex, renumResIndex: vi.fn() } })

        const res = changeResidueIndex(ctx, { ...BASE, bshift: true, value: 1, renumber: false })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/selection/) }))
        expect(shiftResIndex).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok=false when MolAnlManager is unavailable', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const ctx = makeCtx({ scene, molAnlMgr: null })

        const res = changeResidueIndex(ctx, { ...BASE, bshift: true, value: 1, renumber: false })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/MolAnlManager/) }))
    })

    it('returns ok=false when the molecule is missing', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => null)
        const ctx = makeCtx({ scene, molAnlMgr: { shiftResIndex: vi.fn(), renumResIndex: vi.fn() } })

        const res = changeResidueIndex(ctx, { ...BASE, objId: 999, bshift: true, value: 1, renumber: false })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/molecule/) }))
    })

    it('returns the error message when the underlying call throws', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const shiftResIndex = vi.fn(() => { throw new Error('boom') })
        const ctx = makeCtx({ scene, molAnlMgr: { shiftResIndex, renumResIndex: vi.fn() } })

        const res = changeResidueIndex(ctx, { ...BASE, bshift: true, value: 1, renumber: false })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/boom/) }))
        // A throwing mutation must roll the txn back and must NOT commit a
        // bogus undo entry.
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('rolls back without committing when the underlying call returns false', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const shiftResIndex = vi.fn(() => false)
        const ctx = makeCtx({ scene, molAnlMgr: { shiftResIndex, renumResIndex: vi.fn() } })

        const res = changeResidueIndex(ctx, { ...BASE, bshift: true, value: 1, renumber: false })

        expect(res.ok).toBe(false)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})
