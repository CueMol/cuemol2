import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/cameraFile.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function buildCtx(opts: {
    /** What scene.loadCamera should return. Default = a stub with name=cam0. */
    loadedCamera?: { name?: string; vis_size?: number; src?: string } | null
    saveOk?: boolean
    existingNames?: string[]
    sceneOk?: boolean
    camSrc?: string
} = {}) {
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const cameraStub = opts.loadedCamera === null
        ? null
        : opts.loadedCamera ?? { name: 'cam0', vis_size: 0, src: '' }
    const loadVisSettings = vi.fn()
    const camera = cameraStub === null
        ? null
        : {
            ...cameraStub,
            src: opts.camSrc ?? cameraStub.src ?? '',
            loadVisSettings,
        }

    const loadCamera = vi.fn(() => camera)
    const saveCameraTo = vi.fn(() => opts.saveOk ?? true)
    const setCamera = vi.fn()
    const loadViewFromCam = vi.fn()
    const hasCamera = vi.fn((n: string) =>
        (opts.existingNames ?? []).includes(n),
    )
    const getCameraRef = vi.fn((_n: string) => camera)

    const scene = {
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
        loadCamera, saveCameraTo, setCamera, loadViewFromCam,
        hasCamera, getCameraRef,
    }
    const getScene = vi.fn(() => (opts.sceneOk === false ? null : scene))
    const ctx = { sceMgr: { getScene } } as unknown as WorkerContext

    return {
        ctx, scene, camera,
        loadCamera, saveCameraTo, setCamera, loadViewFromCam, hasCamera,
        loadVisSettings, startUndoTxn, commitUndoTxn,
    }
}

describe('cameraFile.loadCameraFromFile', () => {
    it('rejects empty path', () => {
        const { ctx, loadCamera } = buildCtx()
        const res = services.loadCameraFromFile(ctx, {
            sceneId: 1, viewId: 7, path: '',
        })
        expect(res.ok).toBe(false)
        expect(loadCamera).not.toHaveBeenCalled()
    })

    it('loads + setCamera + applies to view under undo txn', () => {
        const { ctx, setCamera, loadViewFromCam, startUndoTxn } = buildCtx()
        const res = services.loadCameraFromFile(ctx, {
            sceneId: 1, viewId: 7, path: '/cam.xml',
        })
        expect(res.ok).toBe(true)
        expect(res.name).toBe('cam0')
        expect(startUndoTxn).toHaveBeenCalledWith('Load camera file cam0')
        expect(setCamera).toHaveBeenCalled()
        expect(loadViewFromCam).toHaveBeenCalledWith(7, 'cam0')
    })

    it('uniquifies the name via copy{i}_<orig> on collision', () => {
        const { ctx, setCamera } = buildCtx({ existingNames: ['cam0'] })
        const res = services.loadCameraFromFile(ctx, {
            sceneId: 1, viewId: 7, path: '/cam.xml',
        })
        expect(res.name).toBe('copy1_cam0')
        expect(setCamera).toHaveBeenCalledWith('copy1_cam0', expect.anything())
    })

    it('also applies vis settings when the loaded camera has vis_size > 0', () => {
        const { ctx, loadVisSettings, scene } = buildCtx({
            loadedCamera: { name: 'cam0', vis_size: 5 },
        })
        const res = services.loadCameraFromFile(ctx, {
            sceneId: 1, viewId: 7, path: '/cam.xml',
        })
        expect(res.ok).toBe(true)
        expect(loadVisSettings).toHaveBeenCalledWith(scene)
    })
})

describe('cameraFile.saveCameraToFile (Save As)', () => {
    it('rejects empty path', () => {
        const { ctx, saveCameraTo } = buildCtx()
        const res = services.saveCameraToFile(ctx, {
            sceneId: 1, name: 'cam0', path: '',
        })
        expect(res.ok).toBe(false)
        expect(saveCameraTo).not.toHaveBeenCalled()
    })

    it('runs saveCameraTo under "Change camera\'s source" txn', () => {
        const { ctx, saveCameraTo, startUndoTxn } = buildCtx()
        const res = services.saveCameraToFile(ctx, {
            sceneId: 1, name: 'cam0', path: '/c.xml',
        })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith("Change camera's source")
        expect(saveCameraTo).toHaveBeenCalledWith('cam0', '/c.xml')
    })
})

describe('cameraFile.saveCameraToCurrentSrc', () => {
    it('returns ok:true,saved:false when src is empty (caller does Save As)', () => {
        const { ctx, saveCameraTo } = buildCtx({ camSrc: '' })
        const res = services.saveCameraToCurrentSrc(ctx, {
            sceneId: 1, name: 'cam0',
        })
        expect(res).toEqual({ ok: true, saved: false })
        expect(saveCameraTo).not.toHaveBeenCalled()
    })

    it('writes to the existing src when present', () => {
        const { ctx, saveCameraTo, startUndoTxn } = buildCtx({
            camSrc: '/existing.xml',
        })
        const res = services.saveCameraToCurrentSrc(ctx, {
            sceneId: 1, name: 'cam0',
        })
        expect(res).toEqual({ ok: true, saved: true })
        expect(startUndoTxn).toHaveBeenCalledWith('Save camera file')
        expect(saveCameraTo).toHaveBeenCalledWith('cam0', '/existing.xml')
    })
})

describe('cameraFile.reloadCameraFromSrc', () => {
    it('rejects when camera has no src', () => {
        const { ctx, setCamera } = buildCtx({ camSrc: '' })
        const res = services.reloadCameraFromSrc(ctx, { sceneId: 1, name: 'cam0' })
        expect(res.ok).toBe(false)
        expect(setCamera).not.toHaveBeenCalled()
    })

    it('reloads + re-registers under the existing name', () => {
        const { ctx, setCamera, startUndoTxn } = buildCtx({
            camSrc: '/existing.xml',
        })
        const res = services.reloadCameraFromSrc(ctx, { sceneId: 1, name: 'cam0' })
        expect(res.ok).toBe(true)
        expect(startUndoTxn).toHaveBeenCalledWith('Reload camera file cam0')
        expect(setCamera).toHaveBeenCalledWith('cam0', expect.anything())
    })
})
