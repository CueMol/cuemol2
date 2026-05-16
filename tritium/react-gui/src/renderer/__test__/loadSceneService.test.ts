import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/loadScene.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

const { loadScene } = services

function makeCtx() {
    const calls: string[] = []
    const setTarget = vi.fn((v: unknown) => { calls.push(`target_scene=${typeof v === 'object' ? '[scene]' : String(v)}`) })
    const setPath = vi.fn((v: string) => { calls.push(`file_path=${v}`) })
    const setCamera = vi.fn((v: boolean) => { calls.push(`set_camera=${v}`) })

    const cmd = {
        get target_scene() { return null },
        set target_scene(v: unknown) { setTarget(v) },
        get file_path() { return '' },
        set file_path(v: string) { setPath(v) },
        get set_camera() { return false },
        set set_camera(v: boolean) { setCamera(v) },
        run: vi.fn(() => { calls.push('run') }),
    }

    const scene = {
        startUndoTxn: vi.fn((label: string) => { calls.push(`start:${label}`) }),
        commitUndoTxn: vi.fn(() => { calls.push('commit') }),
        rollbackUndoTxn: vi.fn(() => { calls.push('rollback') }),
    }

    const ctx = {
        sceMgr: { getScene: vi.fn(() => scene) },
        cmdMgr: { getCmd: vi.fn(() => cmd) },
    } as unknown as WorkerContext

    return { ctx, scene, cmd, calls, setTarget, setPath, setCamera }
}

describe('loadScene.service', () => {
    it('wires target_scene / file_path / set_camera before run, all inside the undo txn', () => {
        const { ctx, calls } = makeCtx()
        const result = loadScene(ctx, { filePath: '/data/test.qsc', sceneId: 1 })
        expect(result).toEqual({ ok: true })
        // Setters happen between txn start and commit, and run is the last
        // mutation before commit.
        expect(calls).toEqual([
            'start:Open scene',
            'target_scene=[scene]',
            'file_path=/data/test.qsc',
            'set_camera=true',
            'run',
            'commit',
        ])
    })

    it('passes the resolved scene wrapper to target_scene', () => {
        const { ctx, scene, setTarget } = makeCtx()
        loadScene(ctx, { filePath: '/x.qsc', sceneId: 3 })
        expect(setTarget).toHaveBeenCalledWith(scene)
    })

    it('forces set_camera=true (UXP parity — scene load always restores the saved camera)', () => {
        const { ctx, setCamera } = makeCtx()
        loadScene(ctx, { filePath: '/x.qsc', sceneId: 3 })
        expect(setCamera).toHaveBeenCalledWith(true)
    })
})
