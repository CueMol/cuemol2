/**
 * @file worker/server/services/withUndoTxn.test.ts
 * @description Pins the transaction helpers' commit / rollback protocol.
 *
 * The one that matters most: `UndoManager::commitTxn` (src/qsys/UndoManager.cpp)
 * clears the redo stack even when the transaction recorded nothing. A service
 * body that bailed out early -- an uncompilable selection, a stale index --
 * therefore killed the user's Redo without changing anything else, and there
 * were 40-odd such bodies under `withUndoTxn`. `undoTxnResult` rolls back on a
 * Fail return instead, which touches neither stack.
 */

import { describe, it, expect, vi } from 'vitest'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import { undoTxnResult, withUndoTxn } from './withUndoTxn'
import { ok, fail } from '../../shared/result'

function makeScene() {
    const calls: string[] = []
    const scene = {
        startUndoTxn: vi.fn((label: string) => calls.push(`start:${label}`)),
        commitUndoTxn: vi.fn(() => calls.push('commit')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollback')),
    }
    return { scene: scene as unknown as Scene, calls }
}

describe('undoTxnResult', () => {
    it('commits on an ok result and passes it through', () => {
        const { scene, calls } = makeScene()
        const r = undoTxnResult(scene, 'Edit', () => ok({ objId: 3 }))
        expect(r).toEqual({ ok: true, objId: 3 })
        expect(calls).toEqual(['start:Edit', 'commit'])
    })

    it('rolls back on a fail result and passes it through', () => {
        const { scene, calls } = makeScene()
        const r = undoTxnResult(scene, 'Edit', () => fail('bad selection', 'invalid-args'))
        expect(r).toEqual({ ok: false, error: 'bad selection', code: 'invalid-args' })
        expect(calls).toEqual(['start:Edit', 'rollback'])
    })

    it('rolls back on a throw and converts it, never rethrowing', () => {
        const { scene, calls } = makeScene()
        const r = undoTxnResult(scene, 'Edit', () => {
            throw new Error('native blew up')
        })
        expect(r).toEqual({ ok: false, error: 'native blew up', code: 'native' })
        expect(calls).toEqual(['start:Edit', 'rollback'])
    })

    it('never commits an empty transaction (which would clear the redo stack)', () => {
        const { scene } = makeScene()
        undoTxnResult(scene, 'No-op', () => fail('nothing to do'))
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})

describe('withUndoTxn (unchanged contract)', () => {
    it('still rethrows so existing callers can translate it themselves', () => {
        const { scene, calls } = makeScene()
        expect(() =>
            withUndoTxn(scene, 'Edit', () => {
                throw new Error('x')
            }),
        ).toThrow('x')
        expect(calls).toEqual(['start:Edit', 'rollback'])
    })
})
