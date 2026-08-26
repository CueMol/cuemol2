/**
 * Legacy renderer type gate: types that stay loadable from existing scenes
 * but are never offered for creation / conversion.
 */

import { describe, it, expect } from 'vitest'
import { isLegacyRendererType, LEGACY_RENDERER_TYPES } from '../worker/server/services/helpers/rendererFilter'

describe('isLegacyRendererType', () => {
    it('hides gpu_mapmesh (fixed line width, slow) and nothing else', () => {
        expect(isLegacyRendererType('gpu_mapmesh')).toBe(true)
        expect(Array.from(LEGACY_RENDERER_TYPES)).toEqual(['gpu_mapmesh'])
        for (const t of ['contour', 'isosurf', 'gpu_mapvol', 'simple', '*selection'])
            expect(isLegacyRendererType(t)).toBe(false)
    })
})
