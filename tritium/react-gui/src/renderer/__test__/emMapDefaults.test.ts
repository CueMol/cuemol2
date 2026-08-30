/**
 * Cryo-EM post-load helpers (worker side): the dialog's map-kind override
 * lands on the DensityMap, the EM renderer defaults are applied only when
 * the map resolves to cryo-EM and the renderer has a contour level, and the
 * view fit runs DensityMap.fitView on every view of the scene.
 */
import { describe, it, expect, vi } from 'vitest'
import {
    applyMapTypeChoice,
    applyEmMapDefaults,
    fitViewsToMap,
    isEmDensityMap,
    EM_INITIAL_TOP_FRACTION,
} from '@renderer/worker/server/services/map/emDefaults'
import type { FormatOptions } from '@renderer/dialogs/fopen-opt-dlgs/types'

function ccp4Format(mapType: 'auto' | 'xtal' | 'em'): FormatOptions {
    return {
        kind: 'ccp4map',
        options: {
            normalize: false, truncateMinEnabled: false, truncateMin: 0,
            truncateMaxEnabled: false, truncateMax: 5, mapType, subsample: 1,
        },
    }
}

describe('applyMapTypeChoice', () => {
    it('writes an explicit kind onto a DensityMap and leaves auto alone', () => {
        const obj: Record<string, unknown> = { map_type_resolved: 'xtal', map_type: 'auto' }
        expect(applyMapTypeChoice(obj, ccp4Format('em'))).toBe(true)
        expect(obj.map_type).toBe('em')

        const obj2: Record<string, unknown> = { map_type_resolved: 'xtal', map_type: 'auto' }
        expect(applyMapTypeChoice(obj2, ccp4Format('auto'))).toBe(false)
        expect(obj2.map_type).toBe('auto')
    })

    it('is a no-op for non-map formats and non-DensityMap objects', () => {
        const mol: Record<string, unknown> = {}
        expect(applyMapTypeChoice(mol, { kind: 'unknown', options: {} } as FormatOptions)).toBe(false)
        expect(applyMapTypeChoice(mol, ccp4Format('em'))).toBe(false)
        expect('map_type' in mol).toBe(false)
    })
})

describe('applyEmMapDefaults', () => {
    it('sets the absolute level enclosing the top fraction on a cryo-EM map', () => {
        const getLevelAtTopFraction = vi.fn(() => 0.123)
        const obj = { map_type_resolved: 'em', getLevelAtTopFraction }
        const rend: Record<string, unknown> = { siglevel: 1.1, use_abslevel: false }
        expect(isEmDensityMap(obj)).toBe(true)
        expect(applyEmMapDefaults(obj, rend)).toBe(true)
        expect(getLevelAtTopFraction).toHaveBeenCalledWith(EM_INITIAL_TOP_FRACTION)
        expect(rend.level).toBe(0.123)
        expect(rend.use_abslevel).toBe(true)
    })

    it('leaves crystallographic maps and non-map renderers untouched', () => {
        const xtal = { map_type_resolved: 'xtal', getLevelAtTopFraction: vi.fn(() => 1) }
        const rend: Record<string, unknown> = { siglevel: 1.1, use_abslevel: false }
        expect(applyEmMapDefaults(xtal, rend)).toBe(false)
        expect(rend.use_abslevel).toBe(false)
        expect('level' in rend).toBe(false)

        const em = { map_type_resolved: 'em', getLevelAtTopFraction: vi.fn(() => 1) }
        const molRend: Record<string, unknown> = { name: 'simple' }
        expect(applyEmMapDefaults(em, molRend)).toBe(false)
        expect(em.getLevelAtTopFraction).not.toHaveBeenCalled()
    })
})

describe('fitViewsToMap', () => {
    it('calls fitView for every view listed by the scene', () => {
        const fitView = vi.fn()
        const obj = { fitView }
        const views: Record<number, { id: number }> = { 3: { id: 3 }, 7: { id: 7 } }
        const scene = {
            view_uids: '3, 7',
            getView: vi.fn((uid: number) => views[uid] ?? null),
        }
        fitViewsToMap(scene as never, obj)
        expect(fitView).toHaveBeenCalledTimes(2)
        expect(fitView).toHaveBeenCalledWith(views[3], false)
        expect(fitView).toHaveBeenCalledWith(views[7], false)
    })

    it('is a no-op without fitView or views', () => {
        const scene = { view_uids: '', getView: vi.fn() }
        fitViewsToMap(scene as never, {})
        fitViewsToMap(scene as never, { fitView: vi.fn() })
        expect(scene.getView).not.toHaveBeenCalled()
    })
})
