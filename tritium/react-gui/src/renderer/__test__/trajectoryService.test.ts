/**
 * Degrade-detection tests for the trajectory pane worker services.
 *
 * These pin the contract between the MD Trajectory pane and the C++
 * Trajectory / TrajBlock scriptable surface:
 *   - getTrajectoryState reads nframe/frame and maps each block via getBlock(i)
 *     to { uid, name, src, nframe, startIndex, format } (format from the src
 *     extension), and returns an empty state for a non-trajectory object.
 *   - setTrajectoryFrame clamps to [0, nframe-1] and writes traj.frame (no undo
 *     txn -- seeking is transient view state).
 *   - appendTrajectoryBlock drives the same reader -> append call sequence as
 *     loadTrajectory, inside one undo txn, and reports append failures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services as trajServices } from '@renderer/worker/server/services/trajectory.service'

interface BlockSpec {
    uid: number
    name: string
    src: string
    nframe: number
    start_index: number
}

function makeTraj(opts: { nframe?: number; frame?: number; blocks?: BlockSpec[] } = {}) {
    let frame = opts.frame ?? 0
    const nframe = opts.nframe ?? 0
    const blocks = opts.blocks ?? []
    const frameWrites: number[] = []
    const traj = {
        uid: 42,
        get frame() { return frame },
        set frame(v: number) { frame = v; frameWrites.push(v) },
        get nframe() { return nframe },
        get nblock() { return blocks.length },
        getBlock: vi.fn((i: number) => blocks[i]),
        append: vi.fn(),
        removeBlock: vi.fn(),
        moveBlock: vi.fn(),
    }
    return { traj, frameWrites }
}

function makeCtx(sceneObj: unknown, extra?: Partial<Record<string, unknown>>) {
    const scene = {
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(() => sceneObj),
        ...extra,
    }
    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        strMgr: { createHandler: vi.fn() },
        svc: {},
    } as unknown as WorkerContext
    return { ctx, scene }
}

describe('getTrajectoryState', () => {
    beforeEach(() => vi.clearAllMocks())

    it('maps nframe/frame and each block to segment info with a format badge', () => {
        const { traj } = makeTraj({
            nframe: 10,
            frame: 4,
            blocks: [
                { uid: 1, name: 'b1', src: '/p/a.xtc', nframe: 5, start_index: 0 },
                { uid: 2, name: 'b2', src: '/p/b.dcd', nframe: 5, start_index: 5 },
            ],
        })
        const { ctx } = makeCtx(traj)

        const res = trajServices.getTrajectoryState(ctx, { sceneId: 1, objId: 42 })

        expect(res.ok).toBe(true)
        expect(res.nframe).toBe(10)
        expect(res.frame).toBe(4)
        expect(res.blocks).toEqual([
            { uid: 1, name: 'b1', src: '/p/a.xtc', nframe: 5, startIndex: 0, format: 'XTC' },
            { uid: 2, name: 'b2', src: '/p/b.dcd', nframe: 5, startIndex: 5, format: 'DCD' },
        ])
    })

    it('returns an empty state for a non-trajectory object (no nframe)', () => {
        const { ctx } = makeCtx({}) // plain object: nframe getter is undefined
        const res = trajServices.getTrajectoryState(ctx, { sceneId: 1, objId: 7 })
        expect(res).toEqual({ ok: false, nframe: 0, frame: 0, blocks: [] })
    })

    it('returns an empty state when the object is missing', () => {
        const { ctx } = makeCtx(null)
        const res = trajServices.getTrajectoryState(ctx, { sceneId: 1, objId: 7 })
        expect(res.ok).toBe(false)
    })
})

describe('setTrajectoryFrame', () => {
    beforeEach(() => vi.clearAllMocks())

    it('clamps above the last frame and writes traj.frame', () => {
        const { traj, frameWrites } = makeTraj({ nframe: 10, frame: 0 })
        const { ctx } = makeCtx(traj)
        const res = trajServices.setTrajectoryFrame(ctx, { sceneId: 1, objId: 42, frame: 100 })
        expect(res).toEqual({ ok: true, frame: 9 })
        expect(frameWrites).toEqual([9])
    })

    it('clamps below zero', () => {
        const { traj } = makeTraj({ nframe: 10 })
        const { ctx } = makeCtx(traj)
        const res = trajServices.setTrajectoryFrame(ctx, { sceneId: 1, objId: 42, frame: -5 })
        expect(res).toEqual({ ok: true, frame: 0 })
    })

    it('truncates a fractional frame to an integer', () => {
        const { traj, frameWrites } = makeTraj({ nframe: 10 })
        const { ctx } = makeCtx(traj)
        trajServices.setTrajectoryFrame(ctx, { sceneId: 1, objId: 42, frame: 3.7 })
        expect(frameWrites).toEqual([3])
    })

    it('fails for a zero-frame / non-trajectory object without writing', () => {
        const { traj, frameWrites } = makeTraj({ nframe: 0 })
        const { ctx } = makeCtx(traj)
        const res = trajServices.setTrajectoryFrame(ctx, { sceneId: 1, objId: 42, frame: 2 })
        expect(res.ok).toBe(false)
        expect(frameWrites).toEqual([])
    })
})

describe('appendTrajectoryBlock', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeAppendFixture() {
        const calls: string[] = []
        const { traj } = makeTraj({ nframe: 20 })
        traj.append = vi.fn(() => calls.push('traj.append'))
        const reader = {
            get targTrajUID() { return 0 },
            set targTrajUID(v: number) { calls.push(`targTrajUID=${v}`) },
            get nevery() { return 1 },
            set nevery(v: number) { calls.push(`nevery=${v}`) },
            createDefaultObj: vi.fn(() => { calls.push('createDefaultObj'); return { __blk: true } }),
            attach: vi.fn(() => calls.push('attach')),
            setPath: vi.fn((p: string) => calls.push(`setPath(${p})`)),
            read: vi.fn(() => calls.push('read')),
            detach: vi.fn(() => calls.push('detach')),
        }
        const scene = {
            startUndoTxn: vi.fn((l: string) => calls.push(`startUndoTxn(${l})`)),
            commitUndoTxn: vi.fn(() => calls.push('commitUndoTxn')),
            rollbackUndoTxn: vi.fn(() => calls.push('rollbackUndoTxn')),
            getObject: vi.fn(() => traj),
        }
        const createHandler = vi.fn(() => reader)
        const ctx = {
            sceMgr: { getScene: vi.fn(() => scene) },
            strMgr: { createHandler },
            svc: {},
        } as unknown as WorkerContext
        return { ctx, calls, traj, scene, reader, createHandler }
    }

    it('reads the block and appends it in one undo txn, returning the new frame count', () => {
        const { ctx, calls, createHandler } = makeAppendFixture()
        const res = trajServices.appendTrajectoryBlock(ctx, {
            sceneId: 1, objId: 42, path: '/p/c.xtc',
        })
        expect(res).toEqual({ ok: true, nframe: 20 })
        expect(createHandler).toHaveBeenCalledWith('xtctraj', expect.anything())
        expect(calls).toEqual([
            'startUndoTxn(Add trajectory block)',
            'targTrajUID=42',
            'createDefaultObj',
            'attach',
            'setPath(/p/c.xtc)',
            'read',
            'detach',
            'traj.append',
            'commitUndoTxn',
        ])
    })

    it('applies nevery>1 as a stride', () => {
        const { ctx, calls } = makeAppendFixture()
        trajServices.appendTrajectoryBlock(ctx, { sceneId: 1, objId: 42, path: '/p/c.dcd', nevery: 4 })
        expect(calls).toContain('nevery=4')
    })

    it('reports an unsupported extension without starting a txn', () => {
        const { ctx, scene } = makeAppendFixture()
        const res = trajServices.appendTrajectoryBlock(ctx, { sceneId: 1, objId: 42, path: '/p/c.xyz' })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/unsupported/)
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('rolls back and reports the error when append fails (atom-count mismatch)', () => {
        const { ctx, scene, traj } = makeAppendFixture()
        ;(traj.append as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
            throw new Error('non compatible atom coord size')
        })
        const res = trajServices.appendTrajectoryBlock(ctx, { sceneId: 1, objId: 42, path: '/p/c.dcd' })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/atom coord size/)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})

describe('removeTrajectoryBlock', () => {
    beforeEach(() => vi.clearAllMocks())

    it('removes the block inside an undo txn', () => {
        const { traj } = makeTraj({ nframe: 5 })
        const { ctx, scene } = makeCtx(traj)
        const res = trajServices.removeTrajectoryBlock(ctx, { sceneId: 1, objId: 42, index: 1 })
        expect(res.ok).toBe(true)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Remove trajectory block')
        expect(traj.removeBlock).toHaveBeenCalledWith(1)
        expect(scene.commitUndoTxn).toHaveBeenCalled()
    })

    it('rolls back and reports when removeBlock throws (bad index)', () => {
        const { traj } = makeTraj({ nframe: 5 })
        ;(traj.removeBlock as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
            throw new Error('removeBlock(): index out of range')
        })
        const { ctx, scene } = makeCtx(traj)
        const res = trajServices.removeTrajectoryBlock(ctx, { sceneId: 1, objId: 42, index: 9 })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/out of range/)
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})

describe('moveTrajectoryBlock', () => {
    beforeEach(() => vi.clearAllMocks())

    it('moves the block inside an undo txn', () => {
        const { traj } = makeTraj({ nframe: 9 })
        const { ctx, scene } = makeCtx(traj)
        const res = trajServices.moveTrajectoryBlock(ctx, { sceneId: 1, objId: 42, from: 0, to: 2 })
        expect(res.ok).toBe(true)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Reorder trajectory block')
        expect(traj.moveBlock).toHaveBeenCalledWith(0, 2)
        expect(scene.commitUndoTxn).toHaveBeenCalled()
    })
})
