/**
 * Degrade-detection tests for `analyzeInteractions` (worker service backing the
 * UXP "Interaction analysis" tool dialog, `tools/intr-tool`).
 *
 * Pins the wire contract:
 *   - dispatches to calcAtomContactJSON / calcAtomContact2JSON /
 *     calcAtomContact3JSON depending on second molecule / second selection
 *   - parses the JSON pair list and registers each pair via appendById
 *     (aid1, objUid, aid2, false) under a single "Define Label(s)" undo txn
 *   - appendById references molecule 2's uid when a second molecule is used,
 *     else molecule 1's uid
 *   - reuses an existing atomintr renderer (by name+type), else creates one and
 *     applies the default styles
 *   - rejects min>=max, maxLabels<=0, and an empty/zero-result analysis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn((_ctx: unknown, str: string) => ({ __sel: str })),
}))

import { services } from '@renderer/worker/server/services/molops/molops.service'

const { analyzeInteractions } = services

function makeRend(existing: boolean) {
    return {
        name: '',
        appendById: vi.fn(),
        applyStyles: vi.fn(),
        __existing: existing,
    }
}

function makeMol(uid: number, rend: ReturnType<typeof makeRend> | null) {
    return {
        uid,
        getRendererByNameType: vi.fn(() => (rend && rend.__existing ? rend : null)),
        createRenderer: vi.fn(() => rend),
    }
}

function makeCtx(opts: {
    mol1: ReturnType<typeof makeMol>
    objects?: Record<number, unknown>
    json?: string
    mgr?: unknown
    sceneId?: number
}) {
    const sid = opts.sceneId ?? 100
    const objects: Record<number, unknown> = {
        1: opts.mol1,
        ...(opts.objects ?? {}),
    }
    const scene = {
        uid: sid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn((id: number) => objects[id] ?? null),
    }
    const mgr = opts.mgr ?? {
        calcAtomContactJSON: vi.fn(() => opts.json ?? '[]'),
        calcAtomContact2JSON: vi.fn(() => opts.json ?? '[]'),
        calcAtomContact3JSON: vi.fn(() => opts.json ?? '[]'),
    }
    const ctx = {
        sceMgr: { getScene: vi.fn((id: number) => (id === sid ? scene : null)) },
        svc: {
            getService: vi.fn((name: string) =>
                name === 'MolAnlManager' ? mgr : null,
            ),
        },
    } as unknown as WorkerContext
    return { ctx, scene, mgr }
}

const BASE = {
    sceneId: 100, objId: 1, selStr: 'sel1',
    useMol2: false, useSel2: false,
    minDist: 2.5, maxDist: 3.5, maxLabels: 30, hbondOnly: false,
    rendName: 'measure',
}

describe('analyzeInteractions', () => {
    beforeEach(() => vi.clearAllMocks())

    it('single molecule: uses calcAtomContactJSON and appends pairs on mol1 uid', () => {
        const rend = makeRend(false)
        const mol1 = makeMol(7, rend)
        const { ctx, scene, mgr } = makeCtx({ mol1, json: '[[10,20],[11,21]]' })

        const res = analyzeInteractions(ctx, { ...BASE })

        expect(res.ok).toBe(true)
        expect(res.count).toBe(2)
        expect((mgr as any).calcAtomContactJSON).toHaveBeenCalledWith(
            mol1, { __sel: 'sel1' }, 2.5, 3.5, false, 30,
        )
        expect((mgr as any).calcAtomContact2JSON).not.toHaveBeenCalled()
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Define Label(s)')
        expect(scene.commitUndoTxn).toHaveBeenCalled()
        // new renderer created + styles applied
        expect(mol1.createRenderer).toHaveBeenCalledWith('atomintr')
        expect(rend.applyStyles).toHaveBeenCalledWith('DefaultLabel,DefaultAtomIntr')
        expect(rend.name).toBe('measure')
        // appendById(aid1, mol1.uid, aid2, false)
        expect(rend.appendById).toHaveBeenNthCalledWith(1, 10, 7, 20, false)
        expect(rend.appendById).toHaveBeenNthCalledWith(2, 11, 7, 21, false)
    })

    it('second selection only: uses calcAtomContact2JSON', () => {
        const rend = makeRend(false)
        const mol1 = makeMol(7, rend)
        const { ctx, mgr } = makeCtx({ mol1, json: '[[1,2]]' })

        const res = analyzeInteractions(ctx, {
            ...BASE, useSel2: true, selStr2: 'sel2',
        })

        expect(res.ok).toBe(true)
        expect((mgr as any).calcAtomContact2JSON).toHaveBeenCalledWith(
            mol1, { __sel: 'sel1' }, { __sel: 'sel2' }, 2.5, 3.5, false, 30,
        )
        expect(rend.appendById).toHaveBeenCalledWith(1, 7, 2, false)
    })

    it('second molecule: uses calcAtomContact3JSON and appends on mol2 uid', () => {
        const rend = makeRend(false)
        const mol1 = makeMol(7, rend)
        const mol2 = makeMol(9, null)
        const { ctx, mgr } = makeCtx({
            mol1, objects: { 2: mol2 }, json: '[[1,2]]',
        })

        const res = analyzeInteractions(ctx, {
            ...BASE, useMol2: true, objId2: 2, useSel2: true, selStr2: 'sel2',
        })

        expect(res.ok).toBe(true)
        expect((mgr as any).calcAtomContact3JSON).toHaveBeenCalledWith(
            mol1, { __sel: 'sel1' }, mol2, { __sel: 'sel2' }, 2.5, 3.5, false, 30,
        )
        // labels reference mol2's uid
        expect(rend.appendById).toHaveBeenCalledWith(1, 9, 2, false)
    })

    it('reuses an existing atomintr renderer without re-applying styles', () => {
        const rend = makeRend(true)
        const mol1 = makeMol(7, rend)
        const { ctx } = makeCtx({ mol1, json: '[[1,2]]' })

        const res = analyzeInteractions(ctx, { ...BASE })

        expect(res.ok).toBe(true)
        expect(mol1.getRendererByNameType).toHaveBeenCalledWith('measure', 'atomintr')
        expect(mol1.createRenderer).not.toHaveBeenCalled()
        expect(rend.applyStyles).not.toHaveBeenCalled()
        expect(rend.appendById).toHaveBeenCalledWith(1, 7, 2, false)
    })

    it('reports a zero-result analysis without opening a txn', () => {
        const rend = makeRend(false)
        const mol1 = makeMol(7, rend)
        const { ctx, scene } = makeCtx({ mol1, json: '[]' })

        const res = analyzeInteractions(ctx, { ...BASE })

        expect(res.ok).toBe(false)
        expect(res.count).toBe(0)
        expect(res.error).toMatch(/No interaction/)
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('rejects min >= max distance', () => {
        const mol1 = makeMol(7, makeRend(false))
        const { ctx, mgr } = makeCtx({ mol1 })
        const res = analyzeInteractions(ctx, { ...BASE, minDist: 4, maxDist: 3 })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/smaller/)
        expect((mgr as any).calcAtomContactJSON).not.toHaveBeenCalled()
    })

    it('rejects maxLabels <= 0', () => {
        const mol1 = makeMol(7, makeRend(false))
        const { ctx } = makeCtx({ mol1 })
        const res = analyzeInteractions(ctx, { ...BASE, maxLabels: 0 })
        expect(res.ok).toBe(false)
        expect(res.error).toMatch(/max labels/)
    })

    it('ignores a second molecule identical to molecule 1 (falls back to single)', () => {
        const rend = makeRend(false)
        const mol1 = makeMol(7, rend)
        const { ctx, mgr } = makeCtx({ mol1, json: '[[1,2]]' })

        const res = analyzeInteractions(ctx, {
            ...BASE, useMol2: true, objId2: 1, // same as objId
        })

        expect(res.ok).toBe(true)
        // mol2 collapses to null -> single-molecule path
        expect((mgr as any).calcAtomContactJSON).toHaveBeenCalled()
        expect((mgr as any).calcAtomContact3JSON).not.toHaveBeenCalled()
        expect(rend.appendById).toHaveBeenCalledWith(1, 7, 2, false)
    })
})
