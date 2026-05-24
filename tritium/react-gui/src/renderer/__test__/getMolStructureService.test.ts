/**
 * Pin worker-side contract for `getMolStructure` (Phase 1):
 *
 *   - listMols     -> filters scene objects to MolCoord-like (probes
 *                     for a `getChainsJSON` method on the wrapper)
 *   - getMolChains -> parses the JSON-array-of-strings emitted by
 *                     `mol.getChainsJSON()` and returns
 *                     `{ name: string }` entries
 *
 * Both fail soft (empty result / `ok:false`) when the scene/object
 * lookup misses; the renderer-side hook treats that as "no data".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import { services } from '../worker/server/services/getMolStructure.service'

const { listMols, getMolChains, getMolResidues, getMolAtoms } = services

interface FakeObj {
    /** Set when the object should pass the MolCoord-like probe. */
    getChainsJSON?: () => string
    [key: string]: unknown
}

function makeScene(opts: {
    sceneDataJSON: string
    objects: Record<number, FakeObj | null>
    uid?: number
}) {
    const getObject = vi.fn((uid: number) => opts.objects[uid] ?? null)
    const getSceneDataJSON = vi.fn(() => opts.sceneDataJSON)
    const scene = {
        getObject,
        getSceneDataJSON,
        uid: opts.uid ?? 100,
    }
    return { scene, getObject, getSceneDataJSON }
}

function makeCtx(sceneByUid: Record<number, unknown | null>): WorkerContext {
    return {
        sceMgr: {
            getScene: vi.fn((uid: number) => sceneByUid[uid] ?? null),
        },
    } as unknown as WorkerContext
}

describe('listMols — molecule enumeration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty list when the scene lookup misses', () => {
        const ctx = makeCtx({})
        expect(listMols(ctx, { sceneId: 999 })).toEqual({ mols: [] })
    })

    it('filters object nodes whose wrapper lacks getChainsJSON', () => {
        const sceneJSON = JSON.stringify([
            { type: '', ID: 1, name: 'scene' },
            { type: 'MolCoord', ID: 11, name: 'mol-A' },
            { type: 'DensityMap', ID: 12, name: 'map-A' },
            { type: 'MolCoord', ID: 13, name: 'mol-B' },
        ])
        const { scene } = makeScene({
            sceneDataJSON: sceneJSON,
            objects: {
                11: { getChainsJSON: () => '["A"]' },
                12: { /* no getChainsJSON */ },
                13: { getChainsJSON: () => '["X","Y"]' },
            },
        })
        const ctx = makeCtx({ 100: scene })
        const result = listMols(ctx, { sceneId: 100 })
        expect(result.mols).toEqual([
            { uid: 11, name: 'mol-A' },
            { uid: 13, name: 'mol-B' },
        ])
    })

    it('does NOT invoke getChainsJSON during the probe (it only checks typeof)', () => {
        const getChainsJSON = vi.fn(() => '["A"]')
        const sceneJSON = JSON.stringify([
            { type: '', ID: 1, name: 'scene' },
            { type: 'MolCoord', ID: 11, name: 'mol-A' },
        ])
        const { scene } = makeScene({
            sceneDataJSON: sceneJSON,
            objects: { 11: { getChainsJSON } },
        })
        const ctx = makeCtx({ 100: scene })
        listMols(ctx, { sceneId: 100 })
        // The probe is typeof === 'function'; we must NOT call it eagerly
        // (UXP avoids extra C++ method calls for the dropdown).
        expect(getChainsJSON).not.toHaveBeenCalled()
    })

    it('tolerates getSceneDataJSON throwing (returns empty list)', () => {
        const { scene, getSceneDataJSON } = makeScene({
            sceneDataJSON: '',
            objects: {},
        })
        getSceneDataJSON.mockImplementation(() => {
            throw new Error('boom')
        })
        const ctx = makeCtx({ 100: scene })
        expect(listMols(ctx, { sceneId: 100 })).toEqual({ mols: [] })
    })
})

describe('getMolChains — chain enumeration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns ok:false when the scene lookup misses', () => {
        const ctx = makeCtx({})
        expect(getMolChains(ctx, { sceneId: 999, molId: 11 })).toEqual({
            ok: false,
            chains: [],
        })
    })

    it('returns ok:false when the object lookup misses', () => {
        const { scene } = makeScene({
            sceneDataJSON: '',
            objects: { 11: null },
        })
        const ctx = makeCtx({ 100: scene })
        expect(getMolChains(ctx, { sceneId: 100, molId: 11 })).toEqual({
            ok: false,
            chains: [],
        })
    })

    it('returns ok:false when the object is not MolCoord-like', () => {
        const { scene } = makeScene({
            sceneDataJSON: '',
            objects: { 12: { someOtherMethod: () => 0 } },
        })
        const ctx = makeCtx({ 100: scene })
        expect(getMolChains(ctx, { sceneId: 100, molId: 12 })).toEqual({
            ok: false,
            chains: [],
        })
    })

    it('parses a JSON array of chain-name strings (UXP shape)', () => {
        const getChainsJSON = vi.fn(() => '["A","B","C"]')
        const { scene } = makeScene({
            sceneDataJSON: '',
            objects: { 11: { getChainsJSON } },
        })
        const ctx = makeCtx({ 100: scene })
        expect(getMolChains(ctx, { sceneId: 100, molId: 11 })).toEqual({
            ok: true,
            chains: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
        })
        expect(getChainsJSON).toHaveBeenCalledTimes(1)
    })

    it('returns ok:false when getChainsJSON throws', () => {
        const getChainsJSON = vi.fn(() => {
            throw new Error('boom')
        })
        const { scene } = makeScene({
            sceneDataJSON: '',
            objects: { 11: { getChainsJSON } },
        })
        const ctx = makeCtx({ 100: scene })
        expect(getMolChains(ctx, { sceneId: 100, molId: 11 })).toEqual({
            ok: false,
            chains: [],
        })
    })

    it('also accepts { name } object entries for forward compat', () => {
        const getChainsJSON = vi.fn(() =>
            JSON.stringify([{ name: 'A' }, { name: 'B' }]),
        )
        const { scene } = makeScene({
            sceneDataJSON: '',
            objects: { 11: { getChainsJSON } },
        })
        const ctx = makeCtx({ 100: scene })
        expect(getMolChains(ctx, { sceneId: 100, molId: 11 })).toEqual({
            ok: true,
            chains: [{ name: 'A' }, { name: 'B' }],
        })
    })
})

describe('getMolResidues — chain residue enumeration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    function fixture(opts: {
        chain?: { getResidsJSON?: () => string } | null
        getChain?: (name: string) => unknown
    }) {
        const getChain = opts.getChain ?? (() => opts.chain ?? null)
        const { scene } = makeScene({
            sceneDataJSON: '',
            objects: { 11: { getChain } },
        })
        return makeCtx({ 100: scene })
    }

    it('returns ok:false when the scene lookup misses', () => {
        const ctx = makeCtx({})
        expect(
            getMolResidues(ctx, { sceneId: 999, molId: 11, chainName: 'A' }),
        ).toEqual({ ok: false, residues: [] })
    })

    it('returns ok:false when getChain returns null', () => {
        const ctx = fixture({ chain: null })
        expect(
            getMolResidues(ctx, { sceneId: 100, molId: 11, chainName: 'A' }),
        ).toEqual({ ok: false, residues: [] })
    })

    it('parses { name, single, sel, index } entries and preserves string index', () => {
        const getResidsJSON = vi.fn(() =>
            JSON.stringify([
                { name: 'ALA', single: 'A', sel: false, index: '10' },
                { name: 'CYS', single: 'C', sel: true, index: '10A' },
                { name: 'GLY', single: 'G', sel: false, index: '11' },
            ]),
        )
        const ctx = fixture({ chain: { getResidsJSON } })
        const result = getMolResidues(ctx, { sceneId: 100, molId: 11, chainName: 'A' })
        expect(result).toEqual({
            ok: true,
            residues: [
                { index: '10', name: 'ALA', single: 'A' },
                { index: '10A', name: 'CYS', single: 'C' },
                { index: '11', name: 'GLY', single: 'G' },
            ],
        })
        expect(getResidsJSON).toHaveBeenCalledTimes(1)
    })

    it('drops entries missing an index', () => {
        const getResidsJSON = vi.fn(() => JSON.stringify([{ name: 'ALA' }]))
        const ctx = fixture({ chain: { getResidsJSON } })
        expect(
            getMolResidues(ctx, { sceneId: 100, molId: 11, chainName: 'A' }),
        ).toEqual({ ok: true, residues: [] })
    })

    it('returns ok:false when getResidsJSON throws', () => {
        const getResidsJSON = vi.fn(() => { throw new Error('boom') })
        const ctx = fixture({ chain: { getResidsJSON } })
        expect(
            getMolResidues(ctx, { sceneId: 100, molId: 11, chainName: 'A' }),
        ).toEqual({ ok: false, residues: [] })
    })

    it('returns ok:false when getChain itself throws', () => {
        const ctx = fixture({
            getChain: () => { throw new Error('no chain') },
        })
        expect(
            getMolResidues(ctx, { sceneId: 100, molId: 11, chainName: 'A' }),
        ).toEqual({ ok: false, residues: [] })
    })
})

describe('getMolAtoms — residue atom enumeration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    function fixture(opts: {
        residue?: { getAtomsJSON?: () => string } | null
        getChain?: () => { getResidue?: (idx: string) => unknown } | null
    }) {
        const defaultChain = {
            getResidue: () => opts.residue ?? null,
        }
        const getChain = opts.getChain ?? (() => defaultChain)
        const { scene } = makeScene({
            sceneDataJSON: '',
            objects: { 11: { getChain } },
        })
        return makeCtx({ 100: scene })
    }

    it('returns ok:false when the residue lookup misses', () => {
        const ctx = fixture({ residue: null })
        expect(
            getMolAtoms(ctx, {
                sceneId: 100,
                molId: 11,
                chainName: 'A',
                residueIndex: '10',
            }),
        ).toEqual({ ok: false, atoms: [] })
    })

    it('parses { name, id, elem } entries (UXP shape)', () => {
        const getAtomsJSON = vi.fn(() =>
            JSON.stringify([
                { name: 'N', id: 1, elem: 'N' },
                { name: 'CA', id: 2, elem: 'C' },
                { name: 'O', id: 4, elem: 'O' },
            ]),
        )
        const ctx = fixture({ residue: { getAtomsJSON } })
        const result = getMolAtoms(ctx, {
            sceneId: 100,
            molId: 11,
            chainName: 'A',
            residueIndex: '10',
        })
        expect(result).toEqual({
            ok: true,
            atoms: [
                { id: 1, name: 'N', elem: 'N' },
                { id: 2, name: 'CA', elem: 'C' },
                { id: 4, name: 'O', elem: 'O' },
            ],
        })
    })

    it('drops entries missing a numeric id', () => {
        const getAtomsJSON = vi.fn(() =>
            JSON.stringify([{ name: 'CA', elem: 'C' }, { name: 'N', id: 'oops', elem: 'N' }]),
        )
        const ctx = fixture({ residue: { getAtomsJSON } })
        expect(
            getMolAtoms(ctx, {
                sceneId: 100,
                molId: 11,
                chainName: 'A',
                residueIndex: '10',
            }),
        ).toEqual({ ok: true, atoms: [] })
    })

    it('returns ok:false when getAtomsJSON throws', () => {
        const getAtomsJSON = vi.fn(() => { throw new Error('boom') })
        const ctx = fixture({ residue: { getAtomsJSON } })
        expect(
            getMolAtoms(ctx, {
                sceneId: 100,
                molId: 11,
                chainName: 'A',
                residueIndex: '10',
            }),
        ).toEqual({ ok: false, atoms: [] })
    })
})
