import { describe, it, expect, vi } from 'vitest'
import { withUndoTxn } from '../worker/services/withUndoTxn'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'

function makeMockScene() {
    const calls: string[] = []
    const scene = {
        startUndoTxn: vi.fn((label: string) => { calls.push(`start:${label}`) }),
        commitUndoTxn: vi.fn(() => { calls.push('commit') }),
        rollbackUndoTxn: vi.fn(() => { calls.push('rollback') }),
    } as unknown as Scene
    return { scene, calls }
}

describe('withUndoTxn', () => {
    it('calls startUndoTxn then commitUndoTxn on success', () => {
        const { scene, calls } = makeMockScene()
        const result = withUndoTxn(scene, 'Test label', () => 42)
        expect(calls).toEqual(['start:Test label', 'commit'])
        expect(result).toBe(42)
    })

    it('calls startUndoTxn then rollbackUndoTxn on throw', () => {
        const { scene, calls } = makeMockScene()
        const error = new Error('boom')
        expect(() => withUndoTxn(scene, 'Fail label', () => { throw error })).toThrow(error)
        expect(calls).toEqual(['start:Fail label', 'rollback'])
    })

    it('does not call commitUndoTxn when fn throws', () => {
        const { scene } = makeMockScene()
        expect(() => withUndoTxn(scene, 'x', () => { throw new Error('fail') })).toThrow()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('re-throws the original error after rollback', () => {
        const { scene } = makeMockScene()
        const error = new Error('original')
        let caught: unknown
        try {
            withUndoTxn(scene, 'x', () => { throw error })
        } catch (e) {
            caught = e
        }
        expect(caught).toBe(error)
    })
})
