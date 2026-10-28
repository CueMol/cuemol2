/**
 * Pin the preset renderer of a cryo-EM map fetched from EMDB: one isosurface
 * in the cryo-EM default style, at the recommended level written as an
 * absolute level (`level`), not as the native `siglevel` (top percent on an
 * EM map), so "reset to default" still returns to the style's level.
 */

import { describe, it, expect } from 'vitest'
import { fakeObject, fakeScene, makeWorkerCtx } from '@renderer/worker/testing'
import { setupDensityMapRenderers } from '@renderer/worker/server/services/map/setupRenderers'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import type { Object as CObject } from '@cuemol/core/src/wrappers/Object'

describe('setupDensityMapRenderers (cryo-EM)', () => {
    it('creates one CryoEMIsoSurf isosurface at the recommended absolute level', () => {
        const log: string[] = []
        const scene = fakeScene({ uid: 1, log })
        const map = fakeObject({ className: 'DensityMap', scene, log })
        const { ctx } = makeWorkerCtx({ scenes: [scene] })

        setupDensityMapRenderers(ctx, scene as unknown as Scene, map as unknown as CObject, 'em', 0.116)

        expect(map.createRenderer).toHaveBeenCalledTimes(1)
        expect(map.createRenderer).toHaveBeenCalledWith('isosurf')
        const rend = map.renderers[0] as unknown as Record<string, unknown>
        expect(rend.applyStyles).toHaveBeenCalledWith('CryoEMIsoSurf')
        expect(rend.level).toBe(0.116)
        expect(rend.siglevel).toBeUndefined()
    })
})
