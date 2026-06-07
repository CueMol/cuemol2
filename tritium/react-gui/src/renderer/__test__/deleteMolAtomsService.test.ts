/**
 * Degrade-detection tests for `deleteMolAtoms` (worker service backing the
 * UXP "Delete atoms" tool dialog, `tools/mol_delete`).
 *
 * Pins the wire contract so the internals can be refactored without silently
 * changing behaviour:
 *   - compiles the selection via `makeSel(ctx, selStr, scene.uid)`
 *   - passes (mol, sel) to `MolAnlManager.deleteAtoms` inside a "Delete atoms"
 *     undo txn
 *   - ok=false (no MolAnlManager call) when the selection fails to compile
 *   - ok=false when MolAnlManager is unavailable
 *   - ok=false when the molecule is missing
 *   - ok=false when deleteAtoms returns false / throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services } from '../worker/server/services/deleteMolAtoms.service'
import { makeSel } from '../worker/server/services/helpers/makeSel'

const { deleteMolAtoms } = services

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

describe('deleteMolAtoms', () => {
    beforeEach(() => vi.clearAllMocks())

    it('compiles the selection and calls MolAnlManager.deleteAtoms(mol, sel) in a "Delete atoms" undo txn', () => {
        const scene = makeUndoScene(100)
        const mol = { __mol: true }
        scene.getObject = vi.fn(() => mol)
        const deleteAtomsFn = vi.fn(() => true)
        const ctx = makeCtx({ scene, molAnlMgr: { deleteAtoms: deleteAtomsFn } })

        const res = deleteMolAtoms(ctx, { sceneId: 100, objId: 42, selStr: 'chain A' })

        expect(res).toEqual({ ok: true })
        expect(makeSel).toHaveBeenCalledWith(ctx, 'chain A', 100)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Delete atoms')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
        expect(deleteAtomsFn).toHaveBeenCalledWith(mol, { __sel: true })
    })

    it('returns ok=false without touching MolAnlManager when the selection fails to compile', () => {
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const deleteAtomsFn = vi.fn()
        const ctx = makeCtx({ scene, molAnlMgr: { deleteAtoms: deleteAtomsFn } })

        const res = deleteMolAtoms(ctx, { sceneId: 100, objId: 1, selStr: 'bogus(' })

        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/selection/)
        expect(deleteAtomsFn).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok=false when MolAnlManager is unavailable', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const ctx = makeCtx({ scene, molAnlMgr: null })

        const res = deleteMolAtoms(ctx, { sceneId: 100, objId: 1, selStr: 'chain A' })

        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/MolAnlManager/)
    })

    it('returns ok=false when the molecule is missing', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => null)
        const ctx = makeCtx({ scene, molAnlMgr: { deleteAtoms: vi.fn() } })

        const res = deleteMolAtoms(ctx, { sceneId: 100, objId: 999, selStr: 'chain A' })

        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/molecule/)
    })

    it('returns ok=false when deleteAtoms returns false', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const ctx = makeCtx({ scene, molAnlMgr: { deleteAtoms: vi.fn(() => false) } })

        const res = deleteMolAtoms(ctx, { sceneId: 100, objId: 1, selStr: 'chain A' })

        expect(res.ok).toBe(false)
    })

    it('returns the error message when deleteAtoms throws', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const deleteAtomsFn = vi.fn(() => { throw new Error('boom') })
        const ctx = makeCtx({ scene, molAnlMgr: { deleteAtoms: deleteAtomsFn } })

        const res = deleteMolAtoms(ctx, { sceneId: 100, objId: 1, selStr: 'chain A' })

        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/boom/)
    })
})
