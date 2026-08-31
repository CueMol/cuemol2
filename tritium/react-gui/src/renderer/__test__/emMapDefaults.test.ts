/**
 * Cryo-EM post-load helpers (worker side): the dialog's map-kind override
 * lands on the DensityMap, the EM renderer defaults are applied only when
 * the map resolves to cryo-EM and the renderer has a contour level, the view
 * fit runs DensityMap.fitView on every view of the scene, and the dialog's
 * view policy picks between that fit and moving the map's display box to the
 * view the user is already on.
 */
import { describe, it, expect, vi } from 'vitest'
import {
    applyMapTypeChoice,
    applyEmMapDefaults,
    applyMapCenterPolicy,
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

describe('applyMapCenterPolicy', () => {
    /** A scene with two views, each reporting its own center. */
    function makeScene() {
        const fitView = vi.fn()
        const views: Record<number, unknown> = {
            3: { getViewCenter: () => 'center-of-3' },
            7: { getViewCenter: () => 'center-of-7' },
        }
        const scene = {
            view_uids: '3, 7',
            getView: vi.fn((uid: number) => views[uid] ?? null),
        }
        return { scene, views, fitView }
    }

    // A cryo-EM map is the whole subject and its ORIGIN can put it far from
    // the camera, so `auto` takes the view to the map.
    it('auto fits the view to a cryo-EM map', () => {
        const { scene, fitView } = makeScene()
        const obj = { map_type_resolved: 'em', fitView }
        const rend: Record<string, unknown> = { center: 'origin' }

        expect(applyMapCenterPolicy(scene as never, obj, rend, 'auto')).toBe('moveViewCenter')
        expect(fitView).toHaveBeenCalledTimes(2)
        expect(rend.center).toBe('origin')
    })

    // A 2Fo-Fc map is read around a model already on screen, so `auto` moves
    // the map's display box instead of the camera (UXP "Set map center").
    it('auto brings a crystallographic map to the view, without moving it', () => {
        const { scene, fitView } = makeScene()
        const obj = { map_type_resolved: 'xtal', fitView }
        const rend: Record<string, unknown> = { center: 'origin' }

        expect(applyMapCenterPolicy(scene as never, obj, rend, 'auto')).toBe('setMapCenter')
        expect(fitView).not.toHaveBeenCalled()
        // The first view stands in for UXP's "current view".
        expect(rend.center).toBe('center-of-3')
    })

    it('an explicit choice overrides the map kind in both directions', () => {
        const em = makeScene()
        const emObj = { map_type_resolved: 'em', fitView: em.fitView }
        const emRend: Record<string, unknown> = { center: 'origin' }
        expect(applyMapCenterPolicy(em.scene as never, emObj, emRend, 'setMapCenter')).toBe('setMapCenter')
        expect(em.fitView).not.toHaveBeenCalled()
        expect(emRend.center).toBe('center-of-3')

        const xtal = makeScene()
        const xtalObj = { map_type_resolved: 'xtal', fitView: xtal.fitView }
        const xtalRend: Record<string, unknown> = { center: 'origin' }
        expect(applyMapCenterPolicy(xtal.scene as never, xtalObj, xtalRend, 'moveViewCenter')).toBe('moveViewCenter')
        expect(xtal.fitView).toHaveBeenCalledTimes(2)
        expect(xtalRend.center).toBe('origin')
    })

    // An ElePotMap has no map kind; leave the view alone rather than guessing.
    it('is a no-op for a scalar object that is not a DensityMap', () => {
        const { scene, fitView } = makeScene()
        const rend: Record<string, unknown> = { center: 'origin' }
        expect(applyMapCenterPolicy(scene as never, { fitView }, rend, 'auto')).toBeNull()
        expect(fitView).not.toHaveBeenCalled()
        expect(rend.center).toBe('origin')
    })
})
