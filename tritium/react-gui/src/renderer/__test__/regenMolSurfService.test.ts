/**
 * Degrade-detection tests for the `regenMolSurf` worker service (UXP
 * "Regenerate surface..." object context-menu item).
 *
 * Pins the wire contract:
 *   - `getMolSurfRegenInfo` reproduces the three-state UXP menu gate: a
 *     non-MolSurfObj row hides the item, a MolSurfObj whose `orig_mol` is
 *     empty or no longer in the scene shows it disabled, and only a
 *     resolvable origin molecule reports `canRegen`
 *   - the stored generation parameters (`orig_den` / `orig_prad` /
 *     `orig_sel`) are surfaced for the dialog prefill
 *   - `regenMolSurf` calls `regenerateSES1(density)` exactly once with an
 *     integer density >= 1 (UXP passes NaN through on a blank field), inside
 *     a "Regenerate mol surface" undo txn, and rolls back on a throw
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from '@renderer/worker/server/services/regenMolSurf.service'

const { getMolSurfRegenInfo, regenMolSurf } = services

const SCENE_ID = 100
const OBJ_ID = 7

interface SurfOpts {
    className?: string
    name?: string
    origMol?: string
    selStr?: string
    density?: number
    probeRadius?: number
    /** Object names that resolve via `scene.getObjectByName`. */
    sceneObjNames?: string[]
    /** Replaces regenerateSES1 with a throwing implementation. */
    regenThrows?: boolean
    /** Omits regenerateSES1 entirely (non-MolSurfObj at the commit path). */
    noRegenMethod?: boolean
}

function makeCtx(opts: SurfOpts & { obj?: unknown | null } = {}) {
    const regenerateSES1 = vi.fn(() => {
        if (opts.regenThrows) throw new Error('boom')
    })
    const surf: Record<string, unknown> = {
        getClassName: () => opts.className ?? 'MolSurfObj',
        name: opts.name ?? 'sf_1crn',
        orig_mol: opts.origMol ?? '1crn',
        orig_sel: { toString: () => opts.selStr ?? '' },
        orig_den: opts.density ?? 2,
        orig_prad: opts.probeRadius ?? 1.4,
    }
    if (!opts.noRegenMethod) surf.regenerateSES1 = regenerateSES1

    const objNames = new Set(opts.sceneObjNames ?? ['1crn'])
    const obj = opts.obj === undefined ? surf : opts.obj
    const scene = {
        uid: SCENE_ID,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn((id: number) => (id === OBJ_ID ? obj : null)),
        getObjectByName: vi.fn((n: string) => (objNames.has(n) ? {} : null)),
    }
    const ctx = {
        sceMgr: { getScene: vi.fn((id: number) => (id === SCENE_ID ? scene : null)) },
    } as unknown as WorkerContext
    return { ctx, scene, surf, regenerateSES1 }
}

describe('getMolSurfRegenInfo', () => {
    beforeEach(() => vi.clearAllMocks())

    it('reports canRegen with the stored generation parameters', () => {
        const { ctx } = makeCtx({
            name: 'sf_1crn', origMol: '1crn', selStr: 'protein',
            density: 3, probeRadius: 1.2,
        })
        expect(getMolSurfRegenInfo(ctx, { sceneId: SCENE_ID, objId: OBJ_ID })).toEqual({
            ok: true,
            canRegen: true,
            objName: 'sf_1crn',
            origMol: '1crn',
            origMolFound: true,
            selStr: 'protein',
            density: 3,
            probeRadius: 1.2,
        })
    })

    it('reports canRegen=false with an empty origMol for a non-MolSurfObj row', () => {
        const { ctx } = makeCtx({ className: 'MolCoord' })
        const res = getMolSurfRegenInfo(ctx, { sceneId: SCENE_ID, objId: OBJ_ID })
        expect(res.ok).toBe(true)
        expect(res.canRegen).toBe(false)
        // The menu hides the item on origMol === '' + canRegenSurface, so the
        // class check must not leak the surface's own fields.
        expect(res.origMol).toBe('')
    })

    it('reports canRegen=false when the surface has no origin molecule', () => {
        const { ctx } = makeCtx({ origMol: '' })
        const res = getMolSurfRegenInfo(ctx, { sceneId: SCENE_ID, objId: OBJ_ID })
        expect(res.canRegen).toBe(false)
        expect(res.origMolFound).toBe(false)
    })

    it('reports canRegen=false when the origin molecule left the scene', () => {
        const { ctx } = makeCtx({ origMol: '1crn', sceneObjNames: [] })
        const res = getMolSurfRegenInfo(ctx, { sceneId: SCENE_ID, objId: OBJ_ID })
        expect(res.canRegen).toBe(false)
        expect(res.origMol).toBe('1crn')
        expect(res.origMolFound).toBe(false)
    })

    it('reports ok=false when the object cannot be resolved', () => {
        const { ctx } = makeCtx({ obj: null })
        const res = getMolSurfRegenInfo(ctx, { sceneId: SCENE_ID, objId: OBJ_ID })
        expect(res.ok).toBe(false)
        expect(res.canRegen).toBe(false)
    })
})

describe('regenMolSurf', () => {
    beforeEach(() => vi.clearAllMocks())

    it('regenerates inside a Regenerate mol surface txn', () => {
        const { ctx, scene, regenerateSES1 } = makeCtx()
        const res = regenMolSurf(ctx, { sceneId: SCENE_ID, objId: OBJ_ID, density: 4 })
        expect(res.ok).toBe(true)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Regenerate mol surface')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        expect(regenerateSES1).toHaveBeenCalledTimes(1)
        expect(regenerateSES1).toHaveBeenCalledWith(4)
    })

    it('coerces the density to an integer >= 1 (UXP leaks NaN here)', () => {
        for (const [input, expected] of [[0, 1], [Number.NaN, 1], [3.7, 3]] as const) {
            const { ctx, regenerateSES1 } = makeCtx()
            regenMolSurf(ctx, { sceneId: SCENE_ID, objId: OBJ_ID, density: input })
            expect(regenerateSES1).toHaveBeenCalledWith(expected)
        }
    })

    it('rolls back and reports the error when regeneration throws', () => {
        const { ctx, scene } = makeCtx({ regenThrows: true })
        const res = regenMolSurf(ctx, { sceneId: SCENE_ID, objId: OBJ_ID, density: 2 })
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/boom/) }))
        expect(scene.rollbackUndoTxn).toHaveBeenCalled()
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('refuses to start a txn on an object that cannot regenerate', () => {
        const { ctx, scene } = makeCtx({ noRegenMethod: true })
        const res = regenMolSurf(ctx, { sceneId: SCENE_ID, objId: OBJ_ID, density: 2 })
        expect(res.ok).toBe(false)
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})
