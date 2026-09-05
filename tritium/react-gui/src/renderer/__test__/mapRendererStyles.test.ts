/**
 * Map-kind default styles of the density map renderers: the style list tells
 * which mode a renderer carries, a map_type change swaps it in place (other
 * names kept, user-picked styles left alone), and the default-style lookup
 * picks the kind's style for map renderers only.
 */
import { describe, it, expect, vi } from 'vitest'
import {
    styleMapKind,
    swapMapModeStyle,
    syncMapRendererStyles,
} from '@renderer/worker/server/services/helpers/mapRendererStyles'
import { getDefaultStyleName } from '@renderer/worker/server/services/helpers/getDefaultStyleName'

describe('map renderer mode styles', () => {
    it('derives the mode from the style list and swaps it in place', () => {
        expect(styleMapKind('DefaultContour,EgLineThin', 'contour')).toBe('xtal')
        expect(styleMapKind('CryoEMIsoSurf', 'isosurf')).toBe('em')
        expect(styleMapKind('MyContour', 'contour')).toBeNull()
        expect(styleMapKind('DefaultContour', 'simple')).toBeNull()

        expect(swapMapModeStyle('DefaultContour,EgLineThin', 'contour', 'em')).toBe('CryoEMContour,EgLineThin')
        expect(swapMapModeStyle('CryoEMIsoSurf', 'isosurf', 'xtal')).toBe('DefaultIsoSurf')
        expect(swapMapModeStyle('CryoEMContour', 'contour', 'em')).toBeNull()
        expect(swapMapModeStyle('MyContour', 'contour', 'em')).toBeNull()
    })

    it('getDefaultStyleName picks the map-kind style for map renderers only', () => {
        expect(getDefaultStyleName('contour')).toBe('DefaultContour')
        expect(getDefaultStyleName('contour', 'em')).toBe('CryoEMContour')
        expect(getDefaultStyleName('isosurf', 'em')).toBe('CryoEMIsoSurf')
        expect(getDefaultStyleName('cartoon', 'em')).toBe('DefaultCartoon,DefaultHSCPaint')
    })

    it('syncMapRendererStyles re-applies only the renderers carrying a mode style', () => {
        const applyA = vi.fn()
        const applyB = vi.fn()
        const applyC = vi.fn()
        const rends = [
            { type_name: 'contour', style: 'DefaultContour,EgLineThin', applyStyles: applyA },
            { type_name: 'isosurf', style: 'MyIsoSurf', applyStyles: applyB },
            { type_name: 'simple', style: 'DefaultSimple', applyStyles: applyC },
        ]
        const obj = {
            map_type_resolved: 'em',
            getRendCount: () => rends.length,
            getRendererByIndex: (i: number) => rends[i],
        }
        expect(syncMapRendererStyles(obj as never)).toBe(1)
        expect(applyA).toHaveBeenCalledWith('CryoEMContour,EgLineThin')
        expect(applyB).not.toHaveBeenCalled()
        expect(applyC).not.toHaveBeenCalled()
    })
})
