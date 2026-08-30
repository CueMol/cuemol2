import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/scene/scene.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

function makeCtx(sceneId = 1) {
    let _viewName = ''
    const mockView = {
        get name() { return _viewName },
        set name(v: string) { _viewName = v },
        getUID: vi.fn(() => 99),
    }
    const mockScene = {
        saveViewToCam: vi.fn(),
        createView: vi.fn(() => mockView),
        loadViewFromCam: vi.fn(),
    }
    const addView = vi.fn()
    const ctx = {
        sceMgr: {
            getScene: vi.fn((uid: number) => uid === sceneId ? mockScene : null),
        },
        svc: { addView },
    } as unknown as WorkerContext

    return { ctx, mockScene, mockView, addView }
}

describe('createViewInScene service', () => {
    it('returns ok:false when scene not found', () => {
        const { ctx } = makeCtx(1)
        expect(services.createViewInScene(ctx, { sceneId: 999, dpr: 1 })).toEqual({ ok: false })
    })

    it('creates view without inherit: no cam operations', () => {
        const { ctx, mockScene, addView } = makeCtx(1)
        const result = services.createViewInScene(ctx, { sceneId: 1, dpr: 2 })
        expect(result).toEqual({ ok: true, view_uid: 99 })
        expect(mockScene.saveViewToCam).not.toHaveBeenCalled()
        expect(mockScene.loadViewFromCam).not.toHaveBeenCalled()
        expect(mockScene.createView).toHaveBeenCalledOnce()
        expect(addView).toHaveBeenCalledWith(99, 2)
    })

    it('sets view name when provided', () => {
        const { ctx, mockView } = makeCtx(1)
        services.createViewInScene(ctx, { sceneId: 1, name: 'MyView', dpr: 1 })
        expect(mockView.name).toBe('MyView')
    })

    it('does not set view name when not provided', () => {
        const { ctx, mockView } = makeCtx(1)
        services.createViewInScene(ctx, { sceneId: 1, dpr: 1 })
        expect(mockView.name).toBe('')
    })

    it('with inheritFromViewId: saves cam before createView, loads after', () => {
        const { ctx, mockScene } = makeCtx(1)
        const callOrder: string[] = []
        mockScene.saveViewToCam.mockImplementation(() => callOrder.push('save'))
        mockScene.createView.mockImplementation(() => { callOrder.push('create'); return { name: '', getUID: vi.fn(() => 99) } })
        mockScene.loadViewFromCam.mockImplementation(() => callOrder.push('load'))

        const result = services.createViewInScene(ctx, { sceneId: 1, inheritFromViewId: 7, dpr: 1 })
        expect(result.ok).toBe(true)
        expect(mockScene.saveViewToCam).toHaveBeenCalledWith(7, '__current')
        expect(mockScene.loadViewFromCam).toHaveBeenCalledWith(99, '__current')
        expect(callOrder).toEqual(['save', 'create', 'load'])
    })

    it('without inheritFromViewId: does not call cam operations even if bInhr would be false', () => {
        const { ctx, mockScene } = makeCtx(1)
        services.createViewInScene(ctx, { sceneId: 1, dpr: 1 })
        expect(mockScene.saveViewToCam).not.toHaveBeenCalled()
        expect(mockScene.loadViewFromCam).not.toHaveBeenCalled()
    })
})
