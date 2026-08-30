import { describe, it, expect } from 'vitest'
import { services } from '@renderer/worker/server/services/getRendererChangeTypes.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { getRendererChangeTypes } = services

function makeCtx(opts: {
    rendType?: string | null
    compatList?: string
    /** Throw from searchCompatibleRendererNames */
    listThrows?: boolean
    /** Don't resolve a renderer */
    noRenderer?: boolean
    /** Don't resolve a scene */
    noScene?: boolean
    /** Don't resolve a parent obj */
    noObj?: boolean
}): WorkerContext {
    const obj = opts.noObj ? null : {
        searchCompatibleRendererNames: opts.listThrows
            ? () => { throw new Error('search failed') }
            : () => opts.compatList ?? '',
    }
    const rend = opts.noRenderer ? null : {
        type_name: opts.rendType ?? 'simple',
        getClientObj: () => obj,
    }
    const scene = opts.noScene ? null : {
        getRenderer: () => rend,
    }
    return {
        sceMgr: { getScene: () => scene },
    } as unknown as WorkerContext
}

describe('getRendererChangeTypes', () => {
    it('returns the comma-separated list filtered to non-current, non-synthetic types', () => {
        const ctx = makeCtx({
            rendType: 'simple',
            compatList: 'simple,ballstick,trace,*selection,atomintr,disorder, ',
        })
        expect(getRendererChangeTypes(ctx, { sceneId: 1, rendId: 2 })).toEqual({
            typeNames: ['ballstick', 'trace'],
        })
    })

    it('hides legacy renderer types (gpu_mapmesh) from the conversion targets', () => {
        const ctx = makeCtx({
            rendType: 'contour',
            compatList: 'contour,isosurf,gpu_mapmesh,gpu_mapvol,*unitcell',
        })
        expect(getRendererChangeTypes(ctx, { sceneId: 1, rendId: 2 })).toEqual({
            typeNames: ['isosurf', 'gpu_mapvol'],
        })
    })

    it('returns empty when the source renderer is *selection (uses dedicated dialog)', () => {
        const ctx = makeCtx({ rendType: '*selection', compatList: 'simple,ballstick' })
        expect(getRendererChangeTypes(ctx, { sceneId: 1, rendId: 2 })).toEqual({ typeNames: [] })
    })

    it('returns empty for synthetic source renderers (e.g. *namelabel)', () => {
        const ctx = makeCtx({ rendType: '*namelabel', compatList: 'simple,ballstick' })
        expect(getRendererChangeTypes(ctx, { sceneId: 1, rendId: 2 })).toEqual({ typeNames: [] })
    })

    it('returns empty for atomintr / disorder source renderers', () => {
        expect(getRendererChangeTypes(makeCtx({ rendType: 'atomintr' }), { sceneId: 1, rendId: 2 }))
            .toEqual({ typeNames: [] })
        expect(getRendererChangeTypes(makeCtx({ rendType: 'disorder' }), { sceneId: 1, rendId: 2 }))
            .toEqual({ typeNames: [] })
    })

    it('swallows searchCompatibleRendererNames exceptions and returns empty', () => {
        const ctx = makeCtx({ rendType: 'simple', listThrows: true })
        expect(getRendererChangeTypes(ctx, { sceneId: 1, rendId: 2 })).toEqual({ typeNames: [] })
    })

    it('returns empty when scene / renderer / obj cannot be resolved', () => {
        expect(getRendererChangeTypes(makeCtx({ noScene: true }), { sceneId: 1, rendId: 2 }))
            .toEqual({ typeNames: [] })
        expect(getRendererChangeTypes(makeCtx({ noRenderer: true }), { sceneId: 1, rendId: 2 }))
            .toEqual({ typeNames: [] })
        expect(getRendererChangeTypes(makeCtx({ noObj: true }), { sceneId: 1, rendId: 2 }))
            .toEqual({ typeNames: [] })
    })
})
