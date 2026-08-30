import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/scene/scene.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

function makeScene(overrides: Partial<{ modified: boolean; viewCount: number; name: string; uid: number }> = {}) {
    return {
        modified: overrides.modified ?? false,
        getViewCount: vi.fn(() => overrides.viewCount ?? 1),
        name: overrides.name ?? 'Scene_1',
        uid: overrides.uid ?? 42,
    }
}

function makeCtx(scene: ReturnType<typeof makeScene> | null, viewExists = true) {
    const mockView = viewExists ? { getScene: vi.fn(() => scene) } : null
    const ctx = {
        sceMgr: { getView: vi.fn(() => mockView) },
    } as unknown as WorkerContext
    return { ctx, mockView }
}

describe('getSceneCloseInfo service', () => {
    it('returns ok:false when view is not found', () => {
        const { ctx } = makeCtx(null, false)
        const result = services.getSceneCloseInfo(ctx, { viewId: 99 })
        expect(result.ok).toBe(false)
    })

    it('returns ok:false when scene is not found', () => {
        const { ctx } = makeCtx(null, true)
        const result = services.getSceneCloseInfo(ctx, { viewId: 1 })
        expect(result.ok).toBe(false)
    })

    it('returns correct info for unmodified scene with single view', () => {
        const scene = makeScene({ modified: false, viewCount: 1, name: 'MyScene', uid: 10 })
        const { ctx } = makeCtx(scene)
        const result = services.getSceneCloseInfo(ctx, { viewId: 5 })
        expect(result).toEqual({ ok: true, modified: false, viewCount: 1, sceneName: 'MyScene', sceneId: 10 })
    })

    it('returns modified:true for a modified scene', () => {
        const scene = makeScene({ modified: true, viewCount: 1 })
        const { ctx } = makeCtx(scene)
        const result = services.getSceneCloseInfo(ctx, { viewId: 5 })
        expect(result.ok).toBe(true)
        expect(result.modified).toBe(true)
    })

    it('returns viewCount > 1 when scene has multiple views', () => {
        const scene = makeScene({ modified: true, viewCount: 3 })
        const { ctx } = makeCtx(scene)
        const result = services.getSceneCloseInfo(ctx, { viewId: 5 })
        expect(result.ok).toBe(true)
        expect(result.viewCount).toBe(3)
    })

    it('handles empty scene name gracefully', () => {
        const scene = makeScene({ name: '' })
        const { ctx } = makeCtx(scene)
        const result = services.getSceneCloseInfo(ctx, { viewId: 5 })
        expect(result.ok).toBe(true)
        expect(result.sceneName).toBe('')
    })
})
