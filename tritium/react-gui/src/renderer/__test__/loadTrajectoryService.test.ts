/**
 * Degrade-detection tests for the MD trajectory worker services.
 *
 * `loadTrajectory` assembles a block-centric Trajectory from a topology file
 * plus ordered trajectory files, purely through scriptable wrapper calls. The
 * exact call sequence is the contract that mirrors the C++ test
 * makeWaterTrajectory()/appendDCD():
 *   createObj('Trajectory') -> topology reader (setPath/attach/read/detach)
 *   -> scene.addObject -> per traj file (targTrajUID + createDefaultObj +
 *   attach + setPath + read + detach + traj.append) -> setupRenderer,
 *   all inside one undo txn.
 *
 * A wrong order (e.g. appending before the topology is read, or forgetting to
 * set targTrajUID) would break trajectory loading against the native side, so
 * the ordered `calls` assertion is the tripwire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import type { RendererOptions } from '../components/fopen-opt-dlgs/types'

vi.mock('../worker/server/services/setupRenderer.service', () => ({
    setupRenderer: vi.fn(),
}))

import { services as loadTrajServices } from '../worker/server/services/loadTrajectory.service'
import { services as trajRendServices } from '../worker/server/services/getTrajectoryRendererInfo.service'
import { setupRenderer } from '../worker/server/services/setupRenderer.service'

const renderer: RendererOptions = {
    objectName: 'system',
    rendererType: 'simple',
    rendererName: 'simple1',
    selectionEnabled: false,
    selection: '*',
    centerView: false,
}

function makeFixture() {
    const calls: string[] = []

    const traj: Record<string, unknown> = {
        uid: 42,
        get name() { return '' },
        set name(v: string) { calls.push(`traj.name=${v}`) },
        append: vi.fn(() => { calls.push('traj.append') }),
    }

    const makeReader = (nick: string) => {
        const block = { __block: nick }
        return {
            setPath: vi.fn((p: string) => calls.push(`${nick}.setPath(${p})`)),
            attach: vi.fn(() => calls.push(`${nick}.attach`)),
            read: vi.fn(() => calls.push(`${nick}.read`)),
            detach: vi.fn(() => calls.push(`${nick}.detach`)),
            createDefaultObj: vi.fn(() => { calls.push(`${nick}.createDefaultObj`); return block }),
            get targTrajUID() { return 0 },
            set targTrajUID(v: number) { calls.push(`${nick}.targTrajUID=${v}`) },
            get nevery() { return 1 },
            set nevery(v: number) { calls.push(`${nick}.nevery=${v}`) },
        }
    }
    const createHandler = vi.fn((nick: string) => makeReader(nick))

    const scene = {
        startUndoTxn: vi.fn((l: string) => calls.push(`startUndoTxn(${l})`)),
        commitUndoTxn: vi.fn(() => calls.push('commitUndoTxn')),
        rollbackUndoTxn: vi.fn(() => calls.push('rollbackUndoTxn')),
        addObject: vi.fn(() => calls.push('scene.addObject')),
    }

    const createObj = vi.fn((className: string) => {
        calls.push(`createObj(${className})`)
        return traj
    })

    const ctx = {
        svc: { createObj },
        strMgr: { createHandler },
        sceMgr: { getScene: vi.fn(() => scene) },
    } as unknown as WorkerContext

    return { ctx, calls, traj, scene, createObj, createHandler }
}

describe('loadTrajectory — block-centric assembly', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('reads the topology, appends each trajectory block in order, then sets up the renderer', () => {
        const { ctx, calls } = makeFixture()
        const result = loadTrajServices.loadTrajectory(ctx, {
            sceneId: 1,
            topologyPath: '/p/system.gro',
            trajPaths: ['/p/a.dcd', '/p/b.xtc'],
            nevery: 1,
            renderer,
        })

        expect(result).toEqual({ ok: true, objId: 42 })
        expect(calls).toEqual([
            'startUndoTxn(Open MD trajectory)',
            'createObj(Trajectory)',
            'gro.setPath(/p/system.gro)',
            'gro.attach',
            'gro.read',
            'gro.detach',
            'traj.name=system',
            'scene.addObject',
            'dcdtraj.targTrajUID=42',
            'dcdtraj.createDefaultObj',
            'dcdtraj.attach',
            'dcdtraj.setPath(/p/a.dcd)',
            'dcdtraj.read',
            'dcdtraj.detach',
            'traj.append',
            'xtctraj.targTrajUID=42',
            'xtctraj.createDefaultObj',
            'xtctraj.attach',
            'xtctraj.setPath(/p/b.xtc)',
            'xtctraj.read',
            'xtctraj.detach',
            'traj.append',
            'commitUndoTxn',
        ])
        expect(setupRenderer).toHaveBeenCalledTimes(1)
    })

    it('maps .trr to the trrtraj reader', () => {
        const { ctx, calls } = makeFixture()
        loadTrajServices.loadTrajectory(ctx, {
            sceneId: 1, topologyPath: '/p/s.gro', trajPaths: ['/p/x.trr'], renderer,
        })
        expect(calls).toContain('trrtraj.setPath(/p/x.trr)')
        expect(calls).toContain('trrtraj.targTrajUID=42')
    })

    it('applies nevery>1 as a stride on each trajectory reader', () => {
        const { ctx, calls } = makeFixture()
        loadTrajServices.loadTrajectory(ctx, {
            sceneId: 1, topologyPath: '/p/s.gro', trajPaths: ['/p/a.dcd'], nevery: 5, renderer,
        })
        expect(calls).toContain('dcdtraj.nevery=5')
    })

    it('does not set nevery when stride is 1 (default)', () => {
        const { ctx, calls } = makeFixture()
        loadTrajServices.loadTrajectory(ctx, {
            sceneId: 1, topologyPath: '/p/s.gro', trajPaths: ['/p/a.dcd'], nevery: 1, renderer,
        })
        expect(calls.some((c) => c.startsWith('dcdtraj.nevery'))).toBe(false)
    })

    it('rolls back and returns the failure when a block append fails (atom-count mismatch)', () => {
        const { ctx, scene, traj } = makeFixture()
        ;(traj.append as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
            throw new Error('atom count mismatch')
        })
        // The C++ throw used to escape as a rejected promise on the renderer
        // side; undoTxnResult converts it after rolling back.
        const result = loadTrajServices.loadTrajectory(ctx, {
            sceneId: 1, topologyPath: '/p/s.gro', trajPaths: ['/p/a.dcd'], renderer,
        })
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'native', error: 'atom count mismatch' }))
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
        expect(setupRenderer).not.toHaveBeenCalled()
    })

    it('rolls back on an unsupported trajectory extension', () => {
        const { ctx, scene } = makeFixture()
        const result = loadTrajServices.loadTrajectory(ctx, {
            sceneId: 1, topologyPath: '/p/s.gro', trajPaths: ['/p/a.xyz'], renderer,
        })
        expect(result).toEqual(expect.objectContaining({
            ok: false, code: 'unsupported', error: expect.stringMatching(/unsupported trajectory format/),
        }))
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
    })

    it('returns ok:false without starting a txn when no trajectory files are given', () => {
        const { ctx, scene } = makeFixture()
        const result = loadTrajServices.loadTrajectory(ctx, {
            sceneId: 1, topologyPath: '/p/s.gro', trajPaths: [], renderer,
        })
        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'invalid-args' }))
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})

describe('getTrajectoryRendererInfo', () => {
    it('returns Trajectory-compatible renderer types, dropping internal and test types', () => {
        const createObj = vi.fn(() => ({
            getClassName: () => 'Trajectory',
            searchCompatibleRendererNames: () => 'simple, *selection, ballstick, ms2test, cpk',
        }))
        const ctx = { svc: { createObj } } as unknown as WorkerContext

        const result = trajRendServices.getTrajectoryRendererInfo(ctx, {})

        expect(result.objClassName).toBe('Trajectory')
        expect(result.types).toEqual(['simple', 'ballstick', 'cpk'])
        expect(createObj).toHaveBeenCalledWith('Trajectory')
    })
})
