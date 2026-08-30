/**
 * Degrade-detection tests for `cameraVisFlags` (worker service backing the
 * camera "Edit visibility flags" editor, UXP `tools/visflagset-edit-dlg`).
 *
 * Pins the wire contract:
 *   - getCameraVisFlags enumerates every object / renderer (scene tree) and
 *     cross-references the camera's stored set (`getVisSetJSON`): `included`
 *     reflects set membership, `visible` is the stored flag when included and
 *     the live flag otherwise;
 *   - setCameraVisFlags rebuilds the set (clearVisSettings then visAppend the
 *     included rows only, with the per-row isObj flag);
 *   - missing camera -> { ok: false }.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
    getSceneOrNull: (ctx: { __scene?: unknown }) => ctx.__scene ?? null,
}))
vi.mock('@renderer/worker/server/services/withUndoTxn', () => ({
    withUndoTxn: (_scene: unknown, _label: string, fn: () => void) => fn(),
}))
vi.mock('@renderer/worker/shared/sceneTreeTypes', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    // One object (uid 11) with one child renderer (uid 21).
    const tree = {
        id: 0, name: 'scene', type: 'scene', className: '', visible: true,
        children: [
            {
                id: 11, name: '1CRN', type: 'object', className: 'MolCoord', visible: true,
                children: [
                    { id: 21, name: 'rend1', type: 'renderer', className: 'cartoon', visible: true, children: [] },
                ],
            },
        ],
    }
    return { ...actual, parseSceneTreeJSON: () => tree }
})

import { services } from '@renderer/worker/server/services/camera/camera.service'

const { getCameraVisFlags, setCameraVisFlags } = services

function makeCam(visSetJSON: string) {
    const clearVisSettings = vi.fn()
    const visAppend = vi.fn()
    const visRemove = vi.fn()
    const cam = {
        getVisSetJSON: () => visSetJSON,
        clearVisSettings,
        visAppend,
        visRemove,
    }
    return { cam, clearVisSettings, visAppend }
}

function makeCtx(cam: unknown): WorkerContext {
    const scene = {
        getCameraRef: () => cam,
        getSceneDataJSON: () => '[]',
    }
    return { __scene: scene } as unknown as WorkerContext
}

describe('cameraVisFlags.getCameraVisFlags', () => {
    it('enumerates objects/renderers and merges the stored set', () => {
        // uid 11 captured with visible=false; uid 21 not captured.
        const { cam } = makeCam(
            JSON.stringify({ '11': { uid: 11, type: 'object', include: true, visible: false } }),
        )
        const res = getCameraVisFlags(makeCtx(cam), { sceneId: 1, cameraName: 'cam1' })
        expect(res.ok).toBe(true)
        expect(res.entries).toEqual([
            { tgtId: 11, tgtName: '1CRN', isObj: true, included: true, visible: false },
            { tgtId: 21, tgtName: 'rend1', isObj: false, included: false, visible: true },
        ])
    })

    it('returns ok:false when the camera is missing', () => {
        const res = getCameraVisFlags(makeCtx(null), { sceneId: 1, cameraName: 'nope' })
        expect(res.ok).toBe(false)
    })
})

describe('cameraVisFlags.setCameraVisFlags', () => {
    it('rebuilds the set: clear then append only included rows with isObj', () => {
        const { cam, clearVisSettings, visAppend } = makeCam('{}')
        const res = setCameraVisFlags(makeCtx(cam), {
            sceneId: 1,
            cameraName: 'cam1',
            entries: [
                { tgtId: 11, tgtName: '1CRN', isObj: true, included: true, visible: true },
                { tgtId: 21, tgtName: 'rend1', isObj: false, included: false, visible: false },
            ],
        })
        expect(res.ok).toBe(true)
        expect(clearVisSettings).toHaveBeenCalledTimes(1)
        expect(visAppend).toHaveBeenCalledTimes(1)
        expect(visAppend).toHaveBeenCalledWith(11, true, true)
    })

    it('returns ok:false when the camera is missing', () => {
        expect(
            setCameraVisFlags(makeCtx(null), { sceneId: 1, cameraName: 'nope', entries: [] }).ok,
        ).toBe(false)
    })
})
