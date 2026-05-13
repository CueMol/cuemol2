import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/cameraOps.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

interface BuildCtxOpts {
    existingNames?: string[]
    /** Camera-ref returned by scene.getCameraRef. */
    camera?: { vis_size?: number }
    saveViewToCamReturns?: boolean
    sceneOk?: boolean
}

function buildCtx(opts: BuildCtxOpts = {}) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const saveVisSettings = vi.fn()
    const loadVisSettings = vi.fn()
    const clearVisSettings = vi.fn()
    const camera = {
        vis_size: opts.camera?.vis_size ?? 0,
        saveVisSettings, loadVisSettings, clearVisSettings,
    }

    const saveViewToCam = vi.fn(() => opts.saveViewToCamReturns ?? true)
    const loadViewFromCam = vi.fn()
    const setCamera = vi.fn()
    const destroyCamera = vi.fn(() => true)
    const hasCamera = vi.fn((n: string) =>
        (opts.existingNames ?? []).includes(n),
    )
    const getCameraRef = vi.fn((_n: string) => camera)

    const scene = {
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
        saveViewToCam, loadViewFromCam, setCamera, destroyCamera,
        hasCamera, getCameraRef,
    }
    const getScene = vi.fn(() => (opts.sceneOk === false ? null : scene))
    const ctx = { sceMgr: { getScene } } as unknown as WorkerContext

    return {
        ctx, scene, camera,
        saveViewToCam, loadViewFromCam, setCamera, destroyCamera,
        hasCamera, getCameraRef,
        saveVisSettings, loadVisSettings, clearVisSettings,
        startUndoTxn, commitUndoTxn,
    }
}

describe('cameraOps.createCamera', () => {
    it('rejects empty / whitespace names', () => {
        const { ctx, saveViewToCam } = buildCtx()
        expect(services.createCamera(ctx, { sceneId: 1, viewId: 7, name: '  ' }).ok).toBe(false)
        expect(saveViewToCam).not.toHaveBeenCalled()
    })

    it('rejects already-taken names', () => {
        const { ctx, saveViewToCam } = buildCtx({ existingNames: ['cam0'] })
        const res = services.createCamera(ctx, { sceneId: 1, viewId: 7, name: 'cam0' })
        expect(res.ok).toBe(false)
        expect(saveViewToCam).not.toHaveBeenCalled()
    })

    it('runs saveViewToCam under undo txn on success', () => {
        const { ctx, saveViewToCam, startUndoTxn, commitUndoTxn } = buildCtx()
        const res = services.createCamera(ctx, { sceneId: 1, viewId: 7, name: 'cam0' })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Create camera: cam0')
        expect(saveViewToCam).toHaveBeenCalledWith(7, 'cam0')
        expect(commitUndoTxn).toHaveBeenCalled()
    })
})

describe('cameraOps.destroyCamera', () => {
    it('rejects unknown camera names', () => {
        const { ctx, destroyCamera } = buildCtx()
        const res = services.destroyCamera(ctx, { sceneId: 1, name: 'nope' })
        expect(res.ok).toBe(false)
        expect(destroyCamera).not.toHaveBeenCalled()
    })

    it('calls destroyCamera under undo txn', () => {
        const { ctx, destroyCamera, startUndoTxn } = buildCtx({ existingNames: ['cam0'] })
        const res = services.destroyCamera(ctx, { sceneId: 1, name: 'cam0' })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Destroy camera: cam0')
        expect(destroyCamera).toHaveBeenCalledWith('cam0')
    })
})

describe('cameraOps.renameCamera', () => {
    it('rejects when newName equals oldName or is empty', () => {
        const { ctx, destroyCamera, setCamera } = buildCtx({ existingNames: ['cam0'] })
        expect(services.renameCamera(ctx, {
            sceneId: 1, oldName: 'cam0', newName: 'cam0',
        }).ok).toBe(false)
        expect(services.renameCamera(ctx, {
            sceneId: 1, oldName: 'cam0', newName: '   ',
        }).ok).toBe(false)
        expect(destroyCamera).not.toHaveBeenCalled()
        expect(setCamera).not.toHaveBeenCalled()
    })

    it('rejects when destination name already exists', () => {
        const { ctx, destroyCamera } = buildCtx({ existingNames: ['cam0', 'cam1'] })
        const res = services.renameCamera(ctx, {
            sceneId: 1, oldName: 'cam0', newName: 'cam1',
        })
        expect(res.ok).toBe(false)
        expect(destroyCamera).not.toHaveBeenCalled()
    })

    it('runs destroyCamera + setCamera atomically under "Rename camera" txn', () => {
        const { ctx, destroyCamera, setCamera, camera, startUndoTxn } = buildCtx({
            existingNames: ['cam0'],
        })
        const res = services.renameCamera(ctx, {
            sceneId: 1, oldName: 'cam0', newName: 'cam-new',
        })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Rename camera cam0')
        expect(destroyCamera).toHaveBeenCalledWith('cam0')
        expect(setCamera).toHaveBeenCalledWith('cam-new', camera)
    })
})

describe('cameraOps.saveViewToCamera', () => {
    it('calls saveViewToCam under "Change camera" txn', () => {
        const { ctx, saveViewToCam, saveVisSettings, startUndoTxn } = buildCtx()
        const res = services.saveViewToCamera(ctx, {
            sceneId: 1, viewId: 7, name: 'cam0', withVisFlags: false,
        })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Change camera cam0')
        expect(saveViewToCam).toHaveBeenCalledWith(7, 'cam0')
        expect(saveVisSettings).not.toHaveBeenCalled()
    })

    it('also calls cam.saveVisSettings when withVisFlags=true', () => {
        const { ctx, saveVisSettings, scene } = buildCtx()
        const res = services.saveViewToCamera(ctx, {
            sceneId: 1, viewId: 7, name: 'cam0', withVisFlags: true,
        })
        expect(res.ok).toBe(true)
        expect(saveVisSettings).toHaveBeenCalledWith(scene)
    })
})

describe('cameraOps.applyCameraToView', () => {
    it('rejects unknown camera', () => {
        const { ctx, loadViewFromCam } = buildCtx()
        const res = services.applyCameraToView(ctx, {
            sceneId: 1, viewId: 7, name: 'cam0', withVisFlags: false,
        })
        expect(res.ok).toBe(false)
        expect(loadViewFromCam).not.toHaveBeenCalled()
    })

    it('calls loadViewFromCam without txn when withVisFlags=false', () => {
        const { ctx, loadViewFromCam, loadVisSettings, startUndoTxn } = buildCtx({
            existingNames: ['cam0'],
        })
        const res = services.applyCameraToView(ctx, {
            sceneId: 1, viewId: 7, name: 'cam0', withVisFlags: false,
        })
        expect(res.ok).toBe(true)
        expect(loadViewFromCam).toHaveBeenCalledWith(7, 'cam0')
        // No undo txn for plain camera apply (it's a navigation, not a
        // scene mutation in UXP).
        expect(startUndoTxn).not.toHaveBeenCalled()
        expect(loadVisSettings).not.toHaveBeenCalled()
    })

    it('also loads vis settings under a separate txn when vis_size > 0 and withVisFlags=true', () => {
        const { ctx, loadVisSettings, scene, startUndoTxn } = buildCtx({
            existingNames: ['cam0'],
            camera: { vis_size: 3 },
        })
        const res = services.applyCameraToView(ctx, {
            sceneId: 1, viewId: 7, name: 'cam0', withVisFlags: true,
        })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Load camera cam0 settings')
        expect(loadVisSettings).toHaveBeenCalledWith(scene)
    })

    it('skips vis-flag load when vis_size == 0 even with withVisFlags=true', () => {
        const { ctx, loadVisSettings, startUndoTxn } = buildCtx({
            existingNames: ['cam0'],
            camera: { vis_size: 0 },
        })
        services.applyCameraToView(ctx, {
            sceneId: 1, viewId: 7, name: 'cam0', withVisFlags: true,
        })
        expect(loadVisSettings).not.toHaveBeenCalled()
        expect(startUndoTxn).not.toHaveBeenCalled()
    })
})

describe('cameraOps.clearCameraVisFlags', () => {
    it('rejects when camera has no vis flags', () => {
        const { ctx, clearVisSettings } = buildCtx({ camera: { vis_size: 0 } })
        const res = services.clearCameraVisFlags(ctx, { sceneId: 1, name: 'cam0' })
        expect(res.ok).toBe(false)
        expect(clearVisSettings).not.toHaveBeenCalled()
    })

    it('clears vis flags under undo txn when vis_size > 0', () => {
        const { ctx, clearVisSettings, startUndoTxn } = buildCtx({
            camera: { vis_size: 4 },
        })
        const res = services.clearCameraVisFlags(ctx, { sceneId: 1, name: 'cam0' })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Clear visibility flags in cam0')
        expect(clearVisSettings).toHaveBeenCalled()
    })
})
