/**
 * Degrade-detection tests for `superposeMol` (worker service), the backend of
 * the Molecular superposition dialog (UXP `tools/ssm_sup.js` port).
 *
 * Pins the observable C++ contract so a future refactor cannot silently change
 * which API is called or when the view is recentered:
 *   - algo='SSM' -> `MolAnlManager.superposeSSM1`, never `superposeLSQ1` (and vice versa)
 *   - a failed selection compile (`makeSel` -> null) aborts before any superpose call
 *   - `autoRecenter` gates the `MolCoord.fitView2(view, movSel)` call, which must
 *     receive the MOVING molecule's selection (UXP recenters the moving mol)
 *
 * `makeSel` / `sceneResolver` are mocked; the real `withUndoTxn` runs against a
 * scene stub so the start/commit/rollback ordering stays exercised.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import type { SuperposeMolArgs } from '../worker/server/services/superposeMol.service'

vi.mock('../worker/server/services/helpers/makeSel', () => ({
    // Distinct object per selection string so we can assert which one flows
    // into fitView2.
    makeSel: vi.fn((_ctx: unknown, selStr: string) => ({ __sel: selStr })),
}))
vi.mock('../worker/server/services/helpers/sceneResolver', () => ({
    getSceneOrNull: vi.fn(),
    getViewOrNull: vi.fn(),
}))

import { superposeMol } from '../worker/server/services/superposeMol.service'
import { makeSel } from '../worker/server/services/helpers/makeSel'
import { getSceneOrNull, getViewOrNull } from '../worker/server/services/helpers/sceneResolver'

const REF_UID = 1
const MOV_UID = 2

function makeFixture(opts: { movHasFitView2?: boolean } = {}) {
    const fitView2 = vi.fn()
    const refMol = { uid: REF_UID }
    const movMol: Record<string, unknown> = { uid: MOV_UID }
    if (opts.movHasFitView2 !== false) movMol.fitView2 = fitView2

    const txn: string[] = []
    const scene = {
        uid: 100,
        getObject: (uid: number) => (uid === REF_UID ? refMol : uid === MOV_UID ? movMol : null),
        startUndoTxn: vi.fn(() => txn.push('start')),
        commitUndoTxn: vi.fn(() => txn.push('commit')),
        rollbackUndoTxn: vi.fn(() => txn.push('rollback')),
    }

    const superposeSSM1 = vi.fn()
    const superposeLSQ1 = vi.fn()
    const mgr = { superposeSSM1, superposeLSQ1 }

    const view = { __view: true }

    const ctx = {
        svc: { getService: vi.fn(() => mgr) },
    } as unknown as WorkerContext

    ;(getSceneOrNull as ReturnType<typeof vi.fn>).mockReturnValue(scene)
    ;(getViewOrNull as ReturnType<typeof vi.fn>).mockReturnValue(view)

    return { ctx, scene, mgr, superposeSSM1, superposeLSQ1, fitView2, view, txn }
}

const baseArgs: SuperposeMolArgs = {
    sceneId: 100,
    viewId: 5,
    algo: 'LSQ',
    refObjId: REF_UID,
    refSel: 'ca',
    movObjId: MOV_UID,
    movSel: 'protein',
    useprop: false,
    autoRecenter: false,
}

describe('superposeMol — algorithm dispatch', () => {
    beforeEach(() => vi.clearAllMocks())

    it("algo='SSM' calls superposeSSM1 only", () => {
        const { ctx, superposeSSM1, superposeLSQ1 } = makeFixture()
        const res = superposeMol(ctx, { ...baseArgs, algo: 'SSM' })
        expect(res).toEqual({ ok: true })
        expect(superposeSSM1).toHaveBeenCalledTimes(1)
        expect(superposeLSQ1).not.toHaveBeenCalled()
        // ref mol/sel then mov mol/sel then useprop flag.
        expect(superposeSSM1).toHaveBeenCalledWith(
            { uid: REF_UID }, { __sel: 'ca' },
            expect.objectContaining({ uid: MOV_UID }), { __sel: 'protein' },
            false,
        )
    })

    it("algo='LSQ' calls superposeLSQ1 only", () => {
        const { ctx, superposeSSM1, superposeLSQ1 } = makeFixture()
        const res = superposeMol(ctx, { ...baseArgs, algo: 'LSQ' })
        expect(res).toEqual({ ok: true })
        expect(superposeLSQ1).toHaveBeenCalledTimes(1)
        expect(superposeSSM1).not.toHaveBeenCalled()
    })
})

describe('superposeMol — selection gate', () => {
    beforeEach(() => vi.clearAllMocks())

    it('invalid reference selection aborts before any superpose call', () => {
        const { ctx, superposeSSM1, superposeLSQ1, scene } = makeFixture()
        ;(makeSel as ReturnType<typeof vi.fn>).mockImplementationOnce(() => null)
        const res = superposeMol(ctx, { ...baseArgs, algo: 'SSM' })
        expect(res.ok).toBe(false)
        expect(superposeSSM1).not.toHaveBeenCalled()
        expect(superposeLSQ1).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})

describe('superposeMol — auto recenter', () => {
    beforeEach(() => vi.clearAllMocks())

    it('autoRecenter=true fits the view onto the MOVING selection', () => {
        const { ctx, fitView2, view } = makeFixture()
        const res = superposeMol(ctx, { ...baseArgs, autoRecenter: true })
        expect(res).toEqual({ ok: true })
        expect(fitView2).toHaveBeenCalledTimes(1)
        expect(fitView2).toHaveBeenCalledWith(view, { __sel: 'protein' })
    })

    it('autoRecenter=false leaves the view untouched', () => {
        const { ctx, fitView2 } = makeFixture()
        superposeMol(ctx, { ...baseArgs, autoRecenter: false })
        expect(fitView2).not.toHaveBeenCalled()
        expect(getViewOrNull).not.toHaveBeenCalled()
    })

    it('autoRecenter=true is skipped silently when the moving mol lacks fitView2', () => {
        const { ctx } = makeFixture({ movHasFitView2: false })
        const res = superposeMol(ctx, { ...baseArgs, autoRecenter: true })
        expect(res).toEqual({ ok: true })
    })
})

describe('superposeMol — failure rolls back', () => {
    beforeEach(() => vi.clearAllMocks())

    it('a throwing superpose rolls back the txn and returns ok=false', () => {
        const { ctx, superposeLSQ1, scene, txn } = makeFixture()
        superposeLSQ1.mockImplementation(() => { throw new Error('boom') })
        const res = superposeMol(ctx, { ...baseArgs, algo: 'LSQ' })
        expect(res.ok).toBe(false)
        expect(res.error).toContain('boom')
        expect(txn).toEqual(['start', 'rollback'])
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })
})
