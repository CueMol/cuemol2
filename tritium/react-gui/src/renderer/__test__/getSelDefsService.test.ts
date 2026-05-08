import { describe, it, expect, vi } from 'vitest'
import { services } from '../worker/server/services/getSelDefs.service'
import type { WorkerContext } from '../worker/server/types/WorkerContext'

function makeCtx(impl: (name: string, sceneUid: number) => string) {
    return {
        styleMgr: {
            getStrDataDefsJSON: vi.fn(impl),
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
})
