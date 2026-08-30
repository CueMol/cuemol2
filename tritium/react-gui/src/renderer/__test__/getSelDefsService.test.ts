import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/getSelDefs.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface SceneStub {
    getObject: (id: number) => { sel: { toString: () => string } | null } | null
}

function makeCtx(
    defsImpl: (name: string, sceneUid: number) => string,
    sceneImpl?: (sceneId: number) => SceneStub | null,
) {
    return {
        styleMgr: {
            getStrDataDefsJSON: vi.fn(defsImpl),
        },
        sceMgr: {
            getScene: vi.fn(sceneImpl ?? (() => null)),
        },
    } as unknown as WorkerContext
}

describe('getSelDefs service', () => {
    it('returns parsed scene + global defs', () => {
        const ctx = makeCtx((name, sceneUid) => {
            expect(name).toBe('sel')
            if (sceneUid === 7) return JSON.stringify(['mySceneSel1', 'mySceneSel2'])
            if (sceneUid === 0) return JSON.stringify(['myGlobalSel'])
            return '[]'
        })
        const result = services.getSelDefs(ctx, { sceneId: 7 })
        expect(result.scene).toEqual(['mySceneSel1', 'mySceneSel2'])
        expect(result.global).toEqual(['myGlobalSel'])
    })

    it('returns empty arrays when JSON is malformed', () => {
        const ctx = makeCtx(() => 'not-json')
        expect(services.getSelDefs(ctx, { sceneId: 1 })).toEqual({ scene: [], global: [] })
    })

    it('drops non-string entries from the parsed list', () => {
        const ctx = makeCtx(() => JSON.stringify(['ok', 42, null, 'also-ok']))
        const result = services.getSelDefs(ctx, { sceneId: 1 })
        expect(result.scene).toEqual(['ok', 'also-ok'])
        expect(result.global).toEqual(['ok', 'also-ok'])
    })

    it('returns empty arrays when parsed root is not an array', () => {
        const ctx = makeCtx(() => '{"not":"array"}')
        expect(services.getSelDefs(ctx, { sceneId: 1 })).toEqual({ scene: [], global: [] })
    })

    it('returns currentSel from mol.sel when molId is provided', () => {
        const ctx = makeCtx(
            () => '[]',
            (sceneId) => sceneId === 7
                ? { getObject: (id) => id === 11 ? { sel: { toString: () => 'chain.A' } } : null }
                : null,
        )
        const result = services.getSelDefs(ctx, { sceneId: 7, molId: 11 })
        expect(result.currentSel).toBe('chain.A')
    })

    it('omits currentSel when molId is not provided', () => {
        const ctx = makeCtx(() => '[]')
        const result = services.getSelDefs(ctx, { sceneId: 1 })
        expect(result.currentSel).toBeUndefined()
    })

    it('omits currentSel when the molecule sel string is empty', () => {
        const ctx = makeCtx(
            () => '[]',
            () => ({ getObject: () => ({ sel: { toString: () => '' } }) }),
        )
        const result = services.getSelDefs(ctx, { sceneId: 1, molId: 11 })
        expect(result.currentSel).toBeUndefined()
    })

    it('omits currentSel when the molecule has no sel', () => {
        const ctx = makeCtx(
            () => '[]',
            () => ({ getObject: () => ({ sel: null }) }),
        )
        const result = services.getSelDefs(ctx, { sceneId: 1, molId: 11 })
        expect(result.currentSel).toBeUndefined()
    })

    it('omits currentSel when the molecule is not found', () => {
        const ctx = makeCtx(
            () => '[]',
            () => ({ getObject: () => null }),
        )
        const result = services.getSelDefs(ctx, { sceneId: 1, molId: 99 })
        expect(result.currentSel).toBeUndefined()
    })
})
