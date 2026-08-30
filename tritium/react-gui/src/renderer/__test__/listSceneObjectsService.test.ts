/**
 * Pin worker-side contract for `listSceneObjects.service`:
 *   - Returns every top-level `object` node in `getSceneDataJSON()`
 *     with uid / name / className. No filtering happens server-side;
 *     the renderer-side ObjectSelect widget owns the filter via its
 *     `filter` predicate.
 *   - Soft-fails (empty list) when the scene lookup misses or the
 *     getSceneDataJSON call throws.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from '@renderer/worker/server/services/scene/scene.service'

const { listSceneObjects } = services

function makeScene(sceneDataJSON: string, uid = 100) {
    const getSceneDataJSON = vi.fn(() => sceneDataJSON)
    const scene = { getSceneDataJSON, uid }
    return { scene, getSceneDataJSON }
}

function makeCtx(sceneByUid: Record<number, unknown | null>): WorkerContext {
    return {
        sceMgr: {
            getScene: vi.fn((uid: number) => sceneByUid[uid] ?? null),
        },
    } as unknown as WorkerContext
}

describe('listSceneObjects', () => {
    it('returns empty when the scene lookup misses', () => {
        const ctx = makeCtx({})
        expect(listSceneObjects(ctx, { sceneId: 999 })).toEqual({ objects: [] })
    })

    it('emits every top-level object node with className intact', () => {
        const sceneJSON = JSON.stringify([
            { type: '', ID: 1, name: 'scene' },
            { type: 'MolCoord', ID: 11, name: 'mol-A' },
            { type: 'DensityMap', ID: 12, name: 'map-A' },
            { type: 'PDBMol', ID: 13, name: 'mol-B' },
        ])
        const { scene } = makeScene(sceneJSON)
        const ctx = makeCtx({ 100: scene })
        expect(listSceneObjects(ctx, { sceneId: 100 })).toEqual({
            objects: [
                { uid: 11, name: 'mol-A', className: 'MolCoord' },
                { uid: 12, name: 'map-A', className: 'DensityMap' },
                { uid: 13, name: 'mol-B', className: 'PDBMol' },
            ],
        })
    })

    it('tolerates getSceneDataJSON throwing (returns empty list)', () => {
        const { scene, getSceneDataJSON } = makeScene('')
        getSceneDataJSON.mockImplementation(() => { throw new Error('boom') })
        const ctx = makeCtx({ 100: scene })
        expect(listSceneObjects(ctx, { sceneId: 100 })).toEqual({ objects: [] })
    })

    it('tolerates malformed JSON (returns empty list)', () => {
        const { scene } = makeScene('{not json')
        const ctx = makeCtx({ 100: scene })
        expect(listSceneObjects(ctx, { sceneId: 100 })).toEqual({ objects: [] })
    })
})
