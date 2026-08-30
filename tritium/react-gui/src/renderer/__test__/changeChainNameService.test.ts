/**
 * Degrade-detection tests for `changeChainName` (worker service backing the
 * UXP "Change chain ID" tool dialog).
 *
 * Pins the wire contract so the internals can be refactored without silently
 * changing behaviour:
 *   - compiles the selection via `makeSel(ctx, selStr, scene.uid)`
 *   - passes (mol, sel, chainName) to `MolAnlManager.changeChainName`
 *     inside a "Change chain name" undo txn
 *   - ok=false (no MolAnlManager call) when the selection fails to compile
 *   - ok=false when MolAnlManager is unavailable
 *   - ok=false carrying the message when changeChainName throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services } from '@renderer/worker/server/services/changeChainName.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { changeChainName } = services

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

describe('changeChainName', () => {
    beforeEach(() => vi.clearAllMocks())

    it('compiles the selection and calls MolAnlManager.changeChainName(mol, sel, name) in a "Change chain name" undo txn', () => {
        const scene = makeUndoScene(100)
        const mol = { __mol: true }
        scene.getObject = vi.fn(() => mol)
        const changeChainNameFn = vi.fn(() => true)
        const ctx = makeCtx({ scene, molAnlMgr: { changeChainName: changeChainNameFn } })

        const res = changeChainName(ctx, {
            sceneId: 100, objId: 42, selStr: 'chain A', chainName: 'B',
        })

        expect(res).toEqual({ ok: true })
        // selection compiled against the scene uid
        expect(makeSel).toHaveBeenCalledWith(ctx, 'chain A', 100)
        // mutation wrapped in the named undo txn
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change chain name')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
        // (mol, compiled-sel, chainName) tuple
        expect(changeChainNameFn).toHaveBeenCalledWith(mol, { __sel: true }, 'B')
    })

    it('returns ok=false without touching MolAnlManager when the selection fails to compile', () => {
        ;(makeSel as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const changeChainNameFn = vi.fn()
        const ctx = makeCtx({ scene, molAnlMgr: { changeChainName: changeChainNameFn } })

        const res = changeChainName(ctx, {
            sceneId: 100, objId: 1, selStr: 'bogus(', chainName: 'B',
        })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/selection/) }))
        expect(changeChainNameFn).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok=false when MolAnlManager is unavailable', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const ctx = makeCtx({ scene, molAnlMgr: null })

        const res = changeChainName(ctx, {
            sceneId: 100, objId: 1, selStr: '*', chainName: 'B',
        })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/MolAnlManager/) }))
    })

    it('returns the error message when changeChainName throws', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => ({ __mol: true }))
        const changeChainNameFn = vi.fn(() => { throw new Error('dup resid') })
        const ctx = makeCtx({ scene, molAnlMgr: { changeChainName: changeChainNameFn } })

        const res = changeChainName(ctx, {
            sceneId: 100, objId: 1, selStr: '*', chainName: 'B',
        })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/dup resid/) }))
        // A throwing mutation must roll the txn back and must NOT commit a
        // bogus undo entry.
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('returns ok=false when the molecule is missing', () => {
        const scene = makeUndoScene(100)
        scene.getObject = vi.fn(() => null)
        const ctx = makeCtx({ scene, molAnlMgr: { changeChainName: vi.fn() } })

        const res = changeChainName(ctx, {
            sceneId: 100, objId: 999, selStr: '*', chainName: 'B',
        })

        expect(res.ok).toBe(false)
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/molecule/) }))
    })
})
