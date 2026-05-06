import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/proposeUniqName.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function makeCtx(options: {
    sceneNames?: string[];
    viewNames?: string[];
    objectNames?: string[];
    sceneId?: number;
    molId?: number;
} = {}) {
    const { sceneNames = [], viewNames = [], objectNames = [], sceneId = 1, molId = 10 } = options

    const mockMol = {
        getRendererByName: vi.fn((_name: string) => {
            return null
        }),
    }

    const mockScene = {
        getViewByName: vi.fn((name: string) => {
            return viewNames.includes(name) ? { uid: 99 } : null
        }),
        getObjectByName: vi.fn((name: string) => {
            return objectNames.includes(name) ? { uid: 99 } : null
        }),
        getObject: vi.fn((uid: number) => {
            return uid === molId ? mockMol : null
        }),
    }

    const ctx = {
        sceMgr: {
            getSceneByName: vi.fn((name: string) => {
                return sceneNames.includes(name) ? { uid: 99 } : null
            }),
            getScene: vi.fn((uid: number) => {
                return uid === sceneId ? mockScene : null
            }),
        },
    } as unknown as WorkerContext

    return { ctx, mockScene, mockMol }
}

describe('proposeUniqName service', () => {
    describe('kind: scene', () => {
        it('returns prefix+1 when no scenes exist', () => {
            const { ctx } = makeCtx()
            expect(services.proposeUniqName(ctx, { kind: 'scene', prefix: 'Scene_' })).toEqual({ name: 'Scene_1' })
        })

        it('increments until finding an unused name', () => {
            const { ctx } = makeCtx({ sceneNames: ['Scene_1', 'Scene_2'] })
            expect(services.proposeUniqName(ctx, { kind: 'scene', prefix: 'Scene_' })).toEqual({ name: 'Scene_3' })
        })
    })

    describe('kind: view', () => {
        it('returns prefix+1 when no views exist', () => {
            const { ctx } = makeCtx({ sceneId: 1 })
            expect(services.proposeUniqName(ctx, { kind: 'view', prefix: 'View_', sceneId: 1 })).toEqual({ name: 'View_1' })
        })

        it('increments past existing view names', () => {
            const { ctx } = makeCtx({ sceneId: 1, viewNames: ['View_1'] })
            expect(services.proposeUniqName(ctx, { kind: 'view', prefix: 'View_', sceneId: 1 })).toEqual({ name: 'View_2' })
        })

        it('falls back to prefix+1 when scene not found', () => {
            const { ctx } = makeCtx({ sceneId: 1 })
            expect(services.proposeUniqName(ctx, { kind: 'view', prefix: 'View_', sceneId: 999 })).toEqual({ name: 'View_1' })
        })
    })

    describe('kind: object', () => {
        it('returns prefix+1 when no objects exist', () => {
            const { ctx } = makeCtx({ sceneId: 1 })
            expect(services.proposeUniqName(ctx, { kind: 'object', prefix: 'Mol_', sceneId: 1 })).toEqual({ name: 'Mol_1' })
        })

        it('increments past existing object names', () => {
            const { ctx } = makeCtx({ sceneId: 1, objectNames: ['Mol_1', 'Mol_2'] })
            expect(services.proposeUniqName(ctx, { kind: 'object', prefix: 'Mol_', sceneId: 1 })).toEqual({ name: 'Mol_3' })
        })
    })
})
