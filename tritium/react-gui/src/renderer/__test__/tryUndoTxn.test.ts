/**
 * Contract tests for `tryUndoTxn` (the non-rethrowing undo-txn wrapper).
 *
 * Unlike `withUndoTxn` (which rethrows and leaves the caller to translate
 * the throw), `tryUndoTxn` converts the outcome into an `{ ok, error? }`
 * result and -- critically -- rolls the transaction back rather than
 * committing on any failure path:
 *   - fn() throws         -> rollback called, commit NOT called, { ok:false, error }
 *   - fn() returns false  -> rollback called, commit NOT called, { ok:false }
 *   - fn() returns void   -> commit called, rollback NOT called, { ok:true }
 *   - fn() returns true   -> commit called, rollback NOT called, { ok:true }
 *
 * The "commit NOT called on failure" assertions are the degrade gate: the
 * old inline pattern (inner try/catch inside withUndoTxn) committed a
 * failed/partial mutation, leaving a bogus undo entry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import { tryUndoTxn } from '../worker/server/services/withUndoTxn'

function makeScene() {
    return {
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
    } as unknown as Scene & {
        startUndoTxn: ReturnType<typeof vi.fn>
        commitUndoTxn: ReturnType<typeof vi.fn>
        rollbackUndoTxn: ReturnType<typeof vi.fn>
    }
}

describe('tryUndoTxn', () => {
    beforeEach(() => vi.clearAllMocks())

    it('opens the named txn before running fn', () => {
        const scene = makeScene()
        tryUndoTxn(scene, 'My label', () => {})
        expect(scene.startUndoTxn).toHaveBeenCalledWith('My label')
    })

    it('commits and returns { ok:true } when fn returns void', () => {
        const scene = makeScene()
        const res = tryUndoTxn(scene, 'L', () => {})
        expect(res).toEqual({ ok: true })
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
    })

    it('commits and returns { ok:true } when fn returns true', () => {
        const scene = makeScene()
        const res = tryUndoTxn(scene, 'L', () => true)
        expect(res).toEqual({ ok: true })
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
    })

    it('rolls back (NOT commit) and returns { ok:false } when fn returns false', () => {
        const scene = makeScene()
        const res = tryUndoTxn(scene, 'L', () => false)
        expect(res).toEqual({ ok: false })
        expect(scene.rollbackUndoTxn).toHaveBeenCalledTimes(1)
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('rolls back (NOT commit) and returns { ok:false, error } when fn throws', () => {
        const scene = makeScene()
        const res = tryUndoTxn(scene, 'L', () => {
            throw new Error('boom')
        })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/boom/)
        expect(scene.rollbackUndoTxn).toHaveBeenCalledTimes(1)
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('does not rethrow on a throwing fn (preserves the dialog ok=false UX)', () => {
        const scene = makeScene()
        expect(() =>
            tryUndoTxn(scene, 'L', () => {
                throw new Error('nope')
            }),
        ).not.toThrow()
    })
})
