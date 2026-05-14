import { describe, it, expect, vi } from 'vitest'
import {
    getSceneOrNull,
    getViewOrNull,
    getViewSceneOrNull,
    getViewSceneObjOrNull,
} from '../worker/server/services/helpers/sceneResolver'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function makeCtx(opts: {
    scenes?: Record<number, unknown>
    views?: Record<number, unknown>
}): WorkerContext {
    const ctx = {
        sceMgr: {
            getScene: vi.fn((id: number) => opts.scenes?.[id] ?? null),
            getView: vi.fn((id: number) => opts.views?.[id] ?? null),
        },
    } as unknown as WorkerContext
    return ctx
}

describe('sceneResolver', () => {
    describe('getSceneOrNull', () => {
        it('returns the scene when sceneId resolves', () => {
            const scene = { uid: 7 }
            const ctx = makeCtx({ scenes: { 7: scene } })
            expect(getSceneOrNull(ctx, 7)).toBe(scene)
        })

        it('returns null when sceneId is not registered', () => {
            const ctx = makeCtx({ scenes: { 7: { uid: 7 } } })
            expect(getSceneOrNull(ctx, 99)).toBeNull()
        })
    })

    describe('getViewOrNull', () => {
        it('returns the view when viewId resolves', () => {
            const view = { id: 1 }
            const ctx = makeCtx({ views: { 1: view } })
            expect(getViewOrNull(ctx, 1)).toBe(view)
        })

        it('returns null when viewId is missing', () => {
            const ctx = makeCtx({})
            expect(getViewOrNull(ctx, 1)).toBeNull()
        })
    })

    describe('getViewSceneOrNull', () => {
        it('returns { view, scene } when both resolve', () => {
            const scene = { uid: 7 }
            const view = { getScene: () => scene }
            const ctx = makeCtx({ views: { 1: view } })
            expect(getViewSceneOrNull(ctx, 1)).toEqual({ view, scene })
        })

        it('returns null when view is missing', () => {
            const ctx = makeCtx({})
            expect(getViewSceneOrNull(ctx, 1)).toBeNull()
        })

        it('returns null when view has no scene', () => {
            const view = { getScene: () => null }
            const ctx = makeCtx({ views: { 1: view } })
            expect(getViewSceneOrNull(ctx, 1)).toBeNull()
        })
    })

    describe('getViewSceneObjOrNull', () => {
        it('returns { view, scene, obj } when all three resolve', () => {
            const obj = { name: 'mol1' }
            const scene = { getObject: vi.fn(() => obj) }
            const view = { getScene: () => scene }
            const ctx = makeCtx({ views: { 1: view } })
            const result = getViewSceneObjOrNull(ctx, 1, 42)
            expect(result).toEqual({ view, scene, obj })
            expect(scene.getObject).toHaveBeenCalledWith(42)
        })

        it('returns null when object is missing on the resolved scene', () => {
            const scene = { getObject: vi.fn(() => null) }
            const view = { getScene: () => scene }
            const ctx = makeCtx({ views: { 1: view } })
            expect(getViewSceneObjOrNull(ctx, 1, 42)).toBeNull()
        })
    })
})
