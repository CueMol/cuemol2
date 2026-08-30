/**
 * @file __test__/multiGradService.test.ts
 * @description Pin contracts for the multigrad coloring services:
 *   - setMultiGradNodes drag protocol: preview writes txn-free, commit
 *     restores the original then writes inside one txn, abort restores
 *     only, a throwing write rolls back.
 *   - getMultiGradState: single getNodesJSON read, hex packing, map list,
 *     stats fallback to null.
 *   - getMultiGradHistogram: passthrough of histo/nmax, min/max of the
 *     returned JSON ignored.
 *   - setRendererColoring 'paint-type-multigrad': color_mapname default +
 *     colormode string write + empty-gradient heatmap seed, one txn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

import { services } from '@renderer/worker/server/services/coloring/coloring.service'
import { histogramPercentileRange } from '@renderer/worker/server/services/coloring/multiGrad'

const {
    getMultiGradState,
    getMultiGradHistogram,
    setMultiGradNodes,
    setMultiGradColorMap,
    setRendererColoring,
} = services

function makeUndoScene(uid: number) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(),
        getRenderer: vi.fn(),
        getSceneDataJSON: vi.fn(() => '[]'),
    }
}

function makeCtx(scene: ReturnType<typeof makeUndoScene> | null, sceneId = 100) {
    return {
        sceMgr: {
            getScene: vi.fn((id: number) => (id === sceneId ? scene : null)),
        },
        svc: { getService: vi.fn(() => null), createObj: vi.fn() },
    } as unknown as WorkerContext
}

/** A multigrad-capable renderer mock with spied gradient JSON accessors. */
function makeMultiGradRend(opts?: {
    nodesJSON?: string
    size?: number
    colormode?: string
    colorMapName?: string
    mapObj?: Record<string, unknown> | null
}) {
    const setNodesJSON = vi.fn()
    const getNodesJSON = vi.fn(() => opts?.nodesJSON ?? '[]')
    const state = {
        colormode: opts?.colormode ?? 'solid',
        color_mapname: opts?.colorMapName ?? '',
    }
    const rend = {
        multi_grad: {
            getNodesJSON,
            setNodesJSON,
            size: opts?.size ?? 0,
        },
        get colormode() { return state.colormode },
        set colormode(v: string) { state.colormode = v },
        get color_mapname() { return state.color_mapname },
        set color_mapname(v: string) { state.color_mapname = v },
        getColorMapObj: vi.fn(() => opts?.mapObj ?? null),
        getClientObj: vi.fn(() => null),
    }
    return { rend, setNodesJSON, getNodesJSON, state }
}

const NODES = [
    { value: 0, color: '#FF0000' },
    { value: 1, color: '#0000FF' },
]
const ORIG = [{ value: 0.5, color: '#00FF00' }]

beforeEach(() => vi.clearAllMocks())

// --- setMultiGradNodes drag protocol ---

describe('setMultiGradNodes', () => {
    it('preview writes txn-free', () => {
        const scene = makeUndoScene(100)
        const { rend, setNodesJSON } = makeMultiGradRend()
        scene.getRenderer = vi.fn(() => rend)
        const res = setMultiGradNodes(makeCtx(scene), {
            sceneId: 100, rendId: 1, nodes: NODES, mode: 'preview',
        })
        expect(res.ok).toBe(true)
        expect(setNodesJSON).toHaveBeenCalledTimes(1)
        expect(JSON.parse(setNodesJSON.mock.calls[0][0])).toEqual(NODES)
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('commit with originalNodes restores txn-free, then writes in one txn', () => {
        const scene = makeUndoScene(100)
        const { rend, setNodesJSON } = makeMultiGradRend()
        scene.getRenderer = vi.fn(() => rend)
        const calls: string[] = []
        setNodesJSON.mockImplementation(() => {
            calls.push(scene.startUndoTxn.mock.calls.length > 0 ? 'in-txn' : 'pre-txn')
        })
        const res = setMultiGradNodes(makeCtx(scene), {
            sceneId: 100, rendId: 1, nodes: NODES,
            mode: 'commit', originalNodes: ORIG,
        })
        expect(res.ok).toBe(true)
        expect(setNodesJSON).toHaveBeenCalledTimes(2)
        // first call: restore original BEFORE the txn opens
        expect(JSON.parse(setNodesJSON.mock.calls[0][0])).toEqual(ORIG)
        // second call: final nodes AFTER the txn opened
        expect(JSON.parse(setNodesJSON.mock.calls[1][0])).toEqual(NODES)
        expect(calls).toEqual(['pre-txn', 'in-txn'])
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change multi gradient color')
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
        expect(scene.rollbackUndoTxn).not.toHaveBeenCalled()
    })

    it('commit without originalNodes writes once inside the txn', () => {
        const scene = makeUndoScene(100)
        const { rend, setNodesJSON } = makeMultiGradRend()
        scene.getRenderer = vi.fn(() => rend)
        const res = setMultiGradNodes(makeCtx(scene), {
            sceneId: 100, rendId: 1, nodes: NODES, label: 'Add gradient node',
        })
        expect(res.ok).toBe(true)
        expect(setNodesJSON).toHaveBeenCalledTimes(1)
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Add gradient node')
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('abort restores originalNodes txn-free', () => {
        const scene = makeUndoScene(100)
        const { rend, setNodesJSON } = makeMultiGradRend()
        scene.getRenderer = vi.fn(() => rend)
        const res = setMultiGradNodes(makeCtx(scene), {
            sceneId: 100, rendId: 1, nodes: NODES,
            mode: 'abort', originalNodes: ORIG,
        })
        expect(res.ok).toBe(true)
        expect(setNodesJSON).toHaveBeenCalledTimes(1)
        expect(JSON.parse(setNodesJSON.mock.calls[0][0])).toEqual(ORIG)
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('abort without originalNodes fails', () => {
        const scene = makeUndoScene(100)
        const { rend, setNodesJSON } = makeMultiGradRend()
        scene.getRenderer = vi.fn(() => rend)
        const res = setMultiGradNodes(makeCtx(scene), {
            sceneId: 100, rendId: 1, nodes: NODES, mode: 'abort',
        })
        expect(res.ok).toBe(false)
        expect(setNodesJSON).not.toHaveBeenCalled()
    })

    it('a throwing in-txn write rolls back and reports the error', () => {
        const scene = makeUndoScene(100)
        const { rend, setNodesJSON } = makeMultiGradRend()
        scene.getRenderer = vi.fn(() => rend)
        setNodesJSON.mockImplementation(() => { throw new Error('bad color') })
        const res = setMultiGradNodes(makeCtx(scene), {
            sceneId: 100, rendId: 1, nodes: NODES,
        })
        expect(res).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/bad color/) }))
        expect(scene.rollbackUndoTxn).toHaveBeenCalledTimes(1)
        expect(scene.commitUndoTxn).not.toHaveBeenCalled()
    })

    it('fails on a renderer without multi_grad', () => {
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => ({}))
        const res = setMultiGradNodes(makeCtx(scene), {
            sceneId: 100, rendId: 1, nodes: NODES,
        })
        expect(res.ok).toBe(false)
    })
})

// --- getMultiGradState ---

describe('getMultiGradState', () => {
    it('reads nodes via one getNodesJSON call and packs display hex', () => {
        const scene = makeUndoScene(100)
        const { rend, getNodesJSON } = makeMultiGradRend({
            nodesJSON: JSON.stringify([
                { value: 0.5, color: 'red', r: 255, g: 0, b: 0 },
                { value: 2, color: '#00FF00', r: 0, g: 255, b: 0 },
            ]),
            colormode: 'multigrad',
            colorMapName: 'map1',
            mapObj: {
                den_min: -1, den_max: 5, den_mean: 0.5, den_sigma: 1.2,
                den_quant_step: 5.0 / 256,
            },
        })
        scene.getRenderer = vi.fn(() => rend)
        scene.getSceneDataJSON = vi.fn(() => JSON.stringify([
            { ID: 100, type: '', name: 'scene' },
            { ID: 1, type: 'DensityMap', name: 'map1' },
            { ID: 2, type: 'MolCoord', name: 'mol1' },
            { ID: 3, type: 'ElePotMap', name: 'pot1' },
        ]))
        const res = getMultiGradState(makeCtx(scene), { sceneId: 100, rendId: 1 })
        expect(res.ok).toBe(true)
        expect(res.capable).toBe(true)
        expect(getNodesJSON).toHaveBeenCalledTimes(1)
        expect(res.colormode).toBe('multigrad')
        expect(res.colorMapName).toBe('map1')
        expect(res.nodes).toEqual([
            { value: 0.5, color: 'red', hex: '#FF0000' },
            { value: 2, color: '#00FF00', hex: '#00FF00' },
        ])
        expect(res.mapObjects).toEqual([
            { objId: 1, name: 'map1', className: 'DensityMap' },
            { objId: 3, name: 'pot1', className: 'ElePotMap' },
        ])
        expect(res.mapStats).toEqual({
            min: -1, max: 5, mean: 0.5, sigma: 1.2, quantStep: 5.0 / 256,
        })
    })

    it('a missing den_quant_step degrades to 0, not a null mapStats', () => {
        // Objects without the property (older wrapper, exotic map class)
        // must still resolve their stats -- the quant step only relaxes
        // a bin-width floor.
        const scene = makeUndoScene(100)
        const { rend } = makeMultiGradRend({
            colormode: 'multigrad',
            colorMapName: 'map1',
            mapObj: { den_min: -1, den_max: 5, den_mean: 0.5, den_sigma: 1.2 },
        })
        scene.getRenderer = vi.fn(() => rend)
        scene.getSceneDataJSON = vi.fn(() => JSON.stringify([
            { ID: 100, type: '', name: 'scene' },
            { ID: 1, type: 'DensityMap', name: 'map1' },
        ]))
        const res = getMultiGradState(makeCtx(scene), { sceneId: 100, rendId: 1 })
        expect(res.ok).toBe(true)
        expect(res.mapStats).toEqual({
            min: -1, max: 5, mean: 0.5, sigma: 1.2, quantStep: 0,
        })
    })

    it('reports capable=false for a renderer without multi_grad', () => {
        const scene = makeUndoScene(100)
        scene.getRenderer = vi.fn(() => ({}))
        const res = getMultiGradState(makeCtx(scene), { sceneId: 100, rendId: 1 })
        expect(res.ok).toBe(true)
        expect(res.capable).toBe(false)
    })

    it('mapStats is null when the color map does not resolve', () => {
        const scene = makeUndoScene(100)
        const { rend } = makeMultiGradRend({ mapObj: null })
        scene.getRenderer = vi.fn(() => rend)
        const res = getMultiGradState(makeCtx(scene), { sceneId: 100, rendId: 1 })
        expect(res.ok).toBe(true)
        expect(res.mapStats).toBeNull()
        expect(res.mapPercentiles).toBeNull()
    })

    it('computes the central-95% percentile range from the map histogram', () => {
        const scene = makeUndoScene(100)
        // 10 uniform bins over [0, 10]: 2.5% of the mass sits at 0.25,
        // 97.5% at 9.75 (linear interpolation inside the boundary bins).
        const getHistogramJSON = vi.fn(() => JSON.stringify({
            min: 0, max: 10, nbin: 10, nmax: 1, sig: 1,
            histo: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        }))
        const { rend } = makeMultiGradRend({
            mapObj: {
                den_min: 0, den_max: 10, den_mean: 5, den_sigma: 1,
                getHistogramJSON,
            },
        })
        scene.getRenderer = vi.fn(() => rend)
        const res = getMultiGradState(makeCtx(scene), { sceneId: 100, rendId: 1 })
        expect(res.mapPercentiles?.lo).toBeCloseTo(0.25)
        expect(res.mapPercentiles?.hi).toBeCloseTo(9.75)
        // the percentile rebin asks over the map's own range
        expect(getHistogramJSON).toHaveBeenCalledWith(0, 10, 256)
    })
})

// --- histogramPercentileRange ---

describe('histogramPercentileRange', () => {
    it('interpolates inside the boundary bins', () => {
        // all mass in one central bin of [0,10]: both points inside bin 5
        const r = histogramPercentileRange(
            [0, 0, 0, 0, 0, 10, 0, 0, 0, 0], 0, 10, 0.025, 0.975,
        )!
        expect(r.lo).toBeCloseTo(5.025)
        expect(r.hi).toBeCloseTo(5.975)
    })

    it('returns null for empty or zero-mass histograms', () => {
        expect(histogramPercentileRange([], 0, 1, 0.025, 0.975)).toBeNull()
        expect(histogramPercentileRange([0, 0], 0, 1, 0.025, 0.975)).toBeNull()
        expect(histogramPercentileRange([1, 1], 1, 1, 0.025, 0.975)).toBeNull()
    })
})

// --- getMultiGradHistogram ---

describe('getMultiGradHistogram', () => {
    it('passes the requested range through and returns histo/nmax', () => {
        const scene = makeUndoScene(100)
        const getHistogramJSON = vi.fn(() => JSON.stringify({
            // min/max here are the object's own range -- must be ignored
            min: -99, max: 99, nbin: 4, nmax: 7, sig: 1,
            histo: [1, 7, 3, 0],
        }))
        // no den_* stats on the map -> globalNmax unavailable
        const { rend } = makeMultiGradRend({ mapObj: { getHistogramJSON } })
        scene.getRenderer = vi.fn(() => rend)
        const res = getMultiGradHistogram(makeCtx(scene), {
            sceneId: 100, rendId: 1, min: 0, max: 2, nbins: 4,
        })
        expect(res).toEqual({
            ok: true, histo: [1, 7, 3, 0], nmax: 7, globalNmax: null,
        })
        expect(getHistogramJSON).toHaveBeenCalledWith(0, 2, 4)
        expect(getHistogramJSON).toHaveBeenCalledTimes(1)
    })

    it('computes globalNmax over the full map range on the same grid', () => {
        const scene = makeUndoScene(100)
        // bin width = (2-0)/4 = 0.5; map range [-1, 3] aligns to itself
        // (multiples of 0.5) -> full-range call is (-1, 3, 8)
        const getHistogramJSON = vi.fn((min: number, max: number) =>
            JSON.stringify(
                max - min > 3.5
                    ? { nmax: 9, histo: [0, 1, 9, 2, 1, 0, 0, 0] }
                    : { nmax: 7, histo: [1, 7, 3, 0] },
            ))
        const { rend } = makeMultiGradRend({
            mapObj: {
                den_min: -1, den_max: 3, den_mean: 0, den_sigma: 1,
                getHistogramJSON,
            },
        })
        scene.getRenderer = vi.fn(() => rend)
        const res = getMultiGradHistogram(makeCtx(scene), {
            sceneId: 100, rendId: 1, min: 0, max: 2, nbins: 4,
        })
        expect(res.nmax).toBe(7)
        expect(res.globalNmax).toBe(9)
        expect(getHistogramJSON).toHaveBeenNthCalledWith(1, 0, 2, 4)
        expect(getHistogramJSON).toHaveBeenNthCalledWith(2, -1, 3, 8)
    })

    it('falls back to globalNmax=null beyond the full-range bin cap', () => {
        const scene = makeUndoScene(100)
        const getHistogramJSON = vi.fn(() => JSON.stringify({
            nmax: 7, histo: [1, 7, 3, 0],
        }))
        // bin width 0.5 over a map range of 1e6 -> 2e6 bins > 65536 cap
        const { rend } = makeMultiGradRend({
            mapObj: {
                den_min: 0, den_max: 1e6, den_mean: 0, den_sigma: 1,
                getHistogramJSON,
            },
        })
        scene.getRenderer = vi.fn(() => rend)
        const res = getMultiGradHistogram(makeCtx(scene), {
            sceneId: 100, rendId: 1, min: 0, max: 2, nbins: 4,
        })
        expect(res.globalNmax).toBeNull()
        // the capped full-range rebin is skipped entirely
        expect(getHistogramJSON).toHaveBeenCalledTimes(1)
    })

    it('fails when the color map is unresolved', () => {
        const scene = makeUndoScene(100)
        const { rend } = makeMultiGradRend({ mapObj: null })
        scene.getRenderer = vi.fn(() => rend)
        const res = getMultiGradHistogram(makeCtx(scene), {
            sceneId: 100, rendId: 1, min: 0, max: 1, nbins: 8,
        })
        expect(res.ok).toBe(false)
    })
})

// --- setMultiGradColorMap ---

describe('setMultiGradColorMap', () => {
    it('writes color_mapname inside one undo txn', () => {
        const scene = makeUndoScene(100)
        const { rend, state } = makeMultiGradRend()
        scene.getRenderer = vi.fn(() => rend)
        const res = setMultiGradColorMap(makeCtx(scene), {
            sceneId: 100, rendId: 1, mapName: 'map2',
        })
        expect(res.ok).toBe(true)
        expect(state.color_mapname).toBe('map2')
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Change color map')
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
    })
})

// --- setRendererColoring 'paint-type-multigrad' ---

describe("setRendererColoring 'paint-type-multigrad'", () => {
    function sceneWithMap() {
        const scene = makeUndoScene(100)
        scene.getSceneDataJSON = vi.fn(() => JSON.stringify([
            { ID: 100, type: '', name: 'scene' },
            { ID: 1, type: 'DensityMap', name: 'map1' },
        ]))
        return scene
    }

    it('defaults color_mapname to the client map, sets colormode, seeds heatmap', () => {
        const scene = sceneWithMap()
        const mapObj = { den_min: 0, den_max: 3, den_mean: 1, den_sigma: 0.5 }
        const { rend, setNodesJSON, state } = makeMultiGradRend({
            size: 0, mapObj,
        })
        rend.getClientObj = vi.fn(() => ({
            getClassName: () => 'DensityMap',
            name: 'clientmap',
        }) as never)
        scene.getRenderer = vi.fn(() => rend)
        const res = setRendererColoring(makeCtx(scene), {
            sceneId: 100, rendId: 1, coloringId: 'paint-type-multigrad',
        })
        expect(res.ok).toBe(true)
        expect(state.color_mapname).toBe('clientmap')
        expect(state.colormode).toBe('multigrad')
        // heatmap1 seed: Red @ min / Yellow @ min+0.6666*span / White @ max
        expect(setNodesJSON).toHaveBeenCalledTimes(1)
        const seeded = JSON.parse(setNodesJSON.mock.calls[0][0])
        expect(seeded).toEqual([
            { value: 0, color: 'Red' },
            { value: 3 * 0.6666, color: 'Yellow' },
            { value: 3, color: 'White' },
        ])
        expect(scene.startUndoTxn).toHaveBeenCalledTimes(1)
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
    })

    it('falls back to the first scene scalar map for non-map client objects', () => {
        const scene = sceneWithMap()
        const { rend, state } = makeMultiGradRend({ size: 0, mapObj: null })
        rend.getClientObj = vi.fn(() => ({
            getClassName: () => 'MolSurfObj',
            name: 'surf1',
        }) as never)
        scene.getRenderer = vi.fn(() => rend)
        const res = setRendererColoring(makeCtx(scene), {
            sceneId: 100, rendId: 1, coloringId: 'paint-type-multigrad',
        })
        expect(res.ok).toBe(true)
        expect(state.color_mapname).toBe('map1')
        expect(state.colormode).toBe('multigrad')
    })

    it('does not seed when the gradient already has nodes', () => {
        const scene = sceneWithMap()
        const mapObj = { den_min: 0, den_max: 3, den_mean: 1, den_sigma: 0.5 }
        const { rend, setNodesJSON } = makeMultiGradRend({
            size: 2, colorMapName: 'map1', mapObj,
        })
        scene.getRenderer = vi.fn(() => rend)
        const res = setRendererColoring(makeCtx(scene), {
            sceneId: 100, rendId: 1, coloringId: 'paint-type-multigrad',
        })
        expect(res.ok).toBe(true)
        expect(setNodesJSON).not.toHaveBeenCalled()
    })

    it('refuses a renderer without multi_grad', () => {
        const scene = sceneWithMap()
        scene.getRenderer = vi.fn(() => ({}))
        const res = setRendererColoring(makeCtx(scene), {
            sceneId: 100, rendId: 1, coloringId: 'paint-type-multigrad',
        })
        expect(res.ok).toBe(false)
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})
