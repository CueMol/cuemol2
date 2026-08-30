/**
 * Pin contract of `getSeqPanelData.service`:
 *
 *   - bulk-iterates every MolCoord-like object in the scene and
 *     returns one row per (mol, chain) tuple.
 *   - `molIds` filter scopes the iteration to a subset of mols
 *     (used by the SEM_PROPCHG sel surgical refetch).
 *   - chains whose getResidsJSON throws or returns empty are dropped.
 *   - non-MolCoord objects are skipped.
 *
 * The service runs sync inside the worker; this isolates that loop so
 * a refactor that re-introduces per-chain IPC fan-out from the worker
 * side would still fail loudly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

import { services } from '@renderer/worker/server/services/getSeqPanelData.service'

const { getSeqPanelData } = services

function makeChain(opts: { residsJson?: string; throws?: boolean }) {
    return {
        getResidsJSON: vi.fn(() => {
            if (opts.throws) throw new Error('boom')
            return opts.residsJson ?? '[]'
        }),
    }
}

function makeMol(opts: {
    chainsJson?: string
    chains?: Record<string, ReturnType<typeof makeChain>>
    isMolCoord?: boolean
}) {
    const mol: Record<string, unknown> = {}
    if (opts.isMolCoord !== false) {
        mol.getChainsJSON = vi.fn(() => opts.chainsJson ?? '[]')
    }
    mol.getChain = vi.fn((name: string) => opts.chains?.[name] ?? null)
    return mol
}

function makeScene(opts: {
    objectsJson: string
    objects: Record<number, ReturnType<typeof makeMol>>
}) {
    return {
        getSceneDataJSON: vi.fn(() => opts.objectsJson),
        getObject: vi.fn((id: number) => opts.objects[id] ?? null),
    }
}

function makeCtx(scenes: Record<number, ReturnType<typeof makeScene>>): WorkerContext {
    return {
        sceMgr: {
            getScene: vi.fn((id: number) => scenes[id] ?? null),
        },
    } as unknown as WorkerContext
}

/**
 * Helper: build the raw scene-data JSON as emitted by
 * `Scene::getSceneDataJSON()` (the parser keys off `ID` capitalised
 * and the class name lives in `type`).
 */
function buildSceneTree(objects: Array<{ id: number; name: string }>): string {
    return JSON.stringify([
        { ID: 0, name: 'scene', type: 'Scene' },
        ...objects.map((o) => ({
            ID: o.id,
            name: o.name,
            type: 'MolCoord',
            visible: true,
            rends: [],
        })),
    ])
}

describe('getSeqPanelData', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns one row per (mol, chain) tuple across the whole scene', () => {
        const mol1 = makeMol({
            chainsJson: JSON.stringify(['A', 'B']),
            chains: {
                A: makeChain({ residsJson: JSON.stringify([{ index: '1', name: 'MET', single: 'M', sel: false }]) }),
                B: makeChain({ residsJson: JSON.stringify([{ index: '1', name: 'ALA', single: 'A', sel: true }]) }),
            },
        })
        const mol2 = makeMol({
            chainsJson: JSON.stringify(['X']),
            chains: {
                X: makeChain({ residsJson: JSON.stringify([{ index: '1', name: 'GLY', single: 'G', sel: false }]) }),
            },
        })
        const scene = makeScene({
            objectsJson: buildSceneTree([{ id: 11, name: '1CRN' }, { id: 22, name: '4bi3' }]),
            objects: { 11: mol1, 22: mol2 },
        })
        const ctx = makeCtx({ 100: scene })

        const result = getSeqPanelData(ctx, { sceneId: 100 })
        expect(result.rows).toHaveLength(3)
        expect(result.rows.map((r) => `${r.molName}:${r.chainName}`)).toEqual([
            '1CRN:A', '1CRN:B', '4bi3:X',
        ])
        expect(result.rows[1].residues[0].sel).toBe(true)
    })

    it('molIds filter scopes iteration to the listed mols only', () => {
        const mol1 = makeMol({
            chainsJson: JSON.stringify(['A']),
            chains: { A: makeChain({ residsJson: JSON.stringify([{ index: '1', single: 'M', name: 'MET', sel: true }]) }) },
        })
        const mol2 = makeMol({
            chainsJson: JSON.stringify(['X']),
            chains: { X: makeChain({ residsJson: JSON.stringify([{ index: '1', single: 'G', name: 'GLY', sel: false }]) }) },
        })
        const scene = makeScene({
            objectsJson: buildSceneTree([{ id: 11, name: '1CRN' }, { id: 22, name: '4bi3' }]),
            objects: { 11: mol1, 22: mol2 },
        })
        const ctx = makeCtx({ 100: scene })

        const result = getSeqPanelData(ctx, { sceneId: 100, molIds: [22] })
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0].molName).toBe('4bi3')
        // mol1's chains should not have been visited.
        expect((mol1.getChainsJSON as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
        expect((mol2.getChainsJSON as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    })

    it('drops chains whose getResidsJSON throws', () => {
        const mol = makeMol({
            chainsJson: JSON.stringify(['A', 'B']),
            chains: {
                A: makeChain({ throws: true }),
                B: makeChain({ residsJson: JSON.stringify([{ index: '1', single: 'M', name: 'MET', sel: false }]) }),
            },
        })
        const scene = makeScene({
            objectsJson: buildSceneTree([{ id: 11, name: '1CRN' }]),
            objects: { 11: mol },
        })
        const ctx = makeCtx({ 100: scene })

        const result = getSeqPanelData(ctx, { sceneId: 100 })
        expect(result.rows).toHaveLength(1)
        expect(result.rows[0].chainName).toBe('B')
    })

    it('skips objects that are not MolCoord-like', () => {
        const nonMol = makeMol({ isMolCoord: false })
        const scene = makeScene({
            objectsJson: buildSceneTree([{ id: 11, name: 'NotAMol' }]),
            objects: { 11: nonMol },
        })
        const ctx = makeCtx({ 100: scene })
        expect(getSeqPanelData(ctx, { sceneId: 100 })).toEqual({ rows: [] })
    })

    it('returns empty rows when scene lookup misses', () => {
        const ctx = makeCtx({})
        expect(getSeqPanelData(ctx, { sceneId: 999 })).toEqual({ rows: [] })
    })
})
