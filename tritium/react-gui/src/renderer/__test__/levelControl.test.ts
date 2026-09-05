/**
 * The Density map pane's Level field: which property it writes and in which
 * unit, per map kind and display mode.
 */
import { describe, it, expect } from 'vitest'
import { levelControlFor, SIGMA } from '@renderer/features/density/levelControl'
import type { MapRendererState } from '@renderer/worker/server/services/map/types'

function state(over: Partial<MapRendererState>): MapRendererState {
    return {
        alpha: 1, color: '', colormode: 'solid', extent: 10,
        siglevel: 1.5, useAbsLevel: false, level: 0.3, levelUnit: 'sigma',
        maxLevel: 5, minLevel: -5, maxExtent: 100, denSigma: 0.2,
        regionResolved: 'box', mapType: 'xtal',
        defaults: { alpha: false, siglevel: false, extent: false },
        ...over,
    }
}

describe('levelControlFor', () => {
    it('writes siglevel in the native unit, or level in absolute mode', () => {
        const xtal = levelControlFor(state({}))
        expect(xtal).toMatchObject({ prop: 'siglevel', value: 1.5, min: -5, max: 5, unit: SIGMA })
        expect(xtal.hint).toContain('0.300')

        // cryo-EM: top percent, capped at 10 so the drag stays usable
        const em = levelControlFor(state({ levelUnit: 'percent', siglevel: 1.0 }))
        expect(em).toMatchObject({ prop: 'siglevel', value: 1.0, min: 0, max: 10, unit: '%' })

        // absolute: the density range, written back as `level`
        const abs = levelControlFor(state({ levelUnit: 'percent', siglevel: 1.0, useAbsLevel: true }))
        expect(abs).toMatchObject({ prop: 'level', value: 0.3, min: -1, max: 1, unit: '' })
        expect(abs.hint).toBe('= top 1.00 % of grid points')
    })
})
