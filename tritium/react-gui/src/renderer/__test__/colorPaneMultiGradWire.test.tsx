/**
 * Wire tests for the ColorPane Multi-gradient deck (UXP multigrad editor
 * port). Pins the observable renderer-side wire only:
 *
 *   - deck routing: multigrad colormode -> MultiGradSection; map renderer
 *     outside multigrad mode -> guidance note.
 *   - Coloring dropdown: map renderers offer only the Multi-gradient item;
 *     clicking it fires setRendererColoring with 'paint-type-multigrad'.
 *   - toolbar: Add / Delete all / Preset fire setMultiGradNodes commits
 *     with the expected node payloads + labels.
 *   - Color map selector fires setMultiGradColorMap.
 *
 * Drag interactions are pinned in gradientStopBar.test.tsx; the worker
 * protocol in multiGradService.test.ts.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

vi.mock('../hooks/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
    CueColorField: ({
        value,
        onCommit,
    }: {
        value: string
        onCommit: (v: string) => void
    }) => (
        <button
            type="button"
            data-testid="color-commit"
            data-value={value}
            onClick={() => onCommit('#112233')}
        />
    ),
}))

vi.mock('../h3-kit/colorpicker/ColorPickerContext', () => ({
    ColorPickerProvider: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
    ),
    useColorPickerCtx: () => ({ cm: null, sceneId: undefined }),
}))

vi.mock('../components/panes/PaintSelCell', () => ({
    PaintSelCell: () => <input data-testid="paint-sel-cell" readOnly />,
}))

import { ColorPane } from '../components/panes/ColorPane'
import { mountTree, flushPromises } from './helpers/testHarness'

// jsdom has no ResizeObserver; the histogram strip observes its parent.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub

const SCENE_ID = 7
const REND_ID = 100

const MULTIGRAD_STATE = {
    ok: true,
    capable: true,
    colormode: 'multigrad',
    colorMapName: 'map1',
    nodes: [
        { value: 0, color: '#FF0000', hex: '#FF0000' },
        { value: 10, color: 'white', hex: '#FFFFFF' },
    ],
    mapObjects: [
        { objId: 1, name: 'map1', className: 'DensityMap' },
        { objId: 2, name: 'map2', className: 'DensityMap' },
    ],
    mapStats: { min: 0, max: 10, mean: 5, sigma: 1, quantStep: 0 },
    // central-95% range; narrower than the raw map range above
    mapPercentiles: { lo: 0.5, hi: 9.5 },
    // dense map: the bin-width floor stays well below the zoom levels
    // exercised here (10 * 10 / 1e6 = 1e-4).
    mapVoxelCount: 1_000_000,
    mapPeakCount: 0,
}

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

function makeCm(opts: {
    coloringState: Record<string, unknown>
    surfaceTypeName?: string
    multiGradState?: Record<string, unknown>
}): MockCm {
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'listPaintCapableRenderers') {
                return Promise.resolve({
                    ok: true,
                    renderers: [
                        {
                            objId: 11,
                            objName: 'mtz1',
                            rendId: REND_ID,
                            targetKind: 'renderer',
                            name: 'isosurf1',
                            typeName: opts.surfaceTypeName ?? 'isosurf',
                        },
                    ],
                })
            }
            if (name === 'getRendererColoringState') {
                return Promise.resolve(opts.coloringState)
            }
            if (name === 'getMultiGradState') {
                return Promise.resolve(opts.multiGradState ?? MULTIGRAD_STATE)
            }
            if (name === 'getMultiGradHistogram') {
                return Promise.resolve({ ok: true, histo: [], nmax: 0 })
            }
            if (name === 'listElePotMapObjects') {
                return Promise.resolve({ ok: true, objects: [] })
            }
            return Promise.resolve({ ok: true })
        }),
    }
}

/** Coloring state of a map renderer (no coloring prop) in multigrad mode. */
const MAP_REND_MULTIGRAD = {
    ok: true,
    className: '',
    defaultColor: '',
    paintEntries: [],
    surfaceType: 'isosurf',
    colormode: 'multigrad',
    multiGradCapable: true,
}

async function mountWith(coloringState: Record<string, unknown>) {
    const cm = makeCm({ coloringState })
    const handle = mountTree(<ColorPane cm={cm as never} sceneId={SCENE_ID} />)
    await flushPromises()
    return { cm, ...handle }
}

describe('ColorPane multigrad wire', () => {
    beforeEach(() => vi.clearAllMocks())

    it('routes multigrad colormode to the MultiGradSection deck', async () => {
        const { container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        expect(container.querySelector('.mg-stopbar')).not.toBeNull()
        // two stop markers from the mocked state
        expect(container.querySelectorAll('.mg-stop-marker')).toHaveLength(2)
        unmount()
    })

    it('shows the guidance note for a map renderer outside multigrad mode', async () => {
        const { container, unmount } = await mountWith({
            ...MAP_REND_MULTIGRAD,
            colormode: 'solid',
        })
        expect(container.querySelector('.mg-stopbar')).toBeNull()
        expect(
            container.querySelector('.mg-guide-note')?.textContent ?? '',
        ).toContain('Multi-gradient')
        unmount()
    })

    it('map renderer dropdown offers only Multi-gradient and fires the switch', async () => {
        const { cm, container, unmount } = await mountWith({
            ...MAP_REND_MULTIGRAD,
            colormode: 'solid',
        })
        const trigger = Array.from(
            container.querySelectorAll('button'),
        ).find((b) => b.textContent?.includes('Coloring')) as HTMLButtonElement
        await act(async () => { trigger.click() })
        await flushPromises()
        const items = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        )
        expect(items.map((i) => i.textContent)).toEqual([
            'Multi-gradient coloring',
        ])
        await act(async () => { (items[0] as HTMLElement).click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setRendererColoring', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            targetKind: 'renderer',
            coloringId: 'paint-type-multigrad',
        })
        unmount()
    })

    it('Add commits an inserted node with the Add label', async () => {
        const { cm, container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        const add = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === 'Add',
        ) as HTMLButtonElement
        await act(async () => { add.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setMultiGradNodes', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            mode: 'commit',
            originalNodes: undefined,
            label: 'Add gradient node',
            nodes: [
                { value: 0, color: '#FF0000' },
                { value: 5, color: '#FFFFFF' },
                { value: 10, color: 'white' },
            ],
        })
        unmount()
    })

    it('Delete all commits an empty node list', async () => {
        const { cm, container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        const btn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === 'Delete all',
        ) as HTMLButtonElement
        await act(async () => { btn.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setMultiGradNodes', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            mode: 'commit',
            originalNodes: undefined,
            label: 'Delete all gradient nodes',
            nodes: [],
        })
        unmount()
    })

    it('Preset Rainbow commits the UXP rainbow nodes over the map range', async () => {
        const { cm, container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        const preset = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.includes('Preset'),
        ) as HTMLButtonElement
        await act(async () => { preset.click() })
        await flushPromises()
        const rainbow = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ).find((i) => i.textContent === 'Rainbow') as HTMLElement
        await act(async () => { rainbow.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setMultiGradNodes', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            mode: 'commit',
            originalNodes: undefined,
            label: 'Apply gradient preset',
            nodes: [
                { value: 0, color: '#FF0000' },
                { value: 2, color: '#FFFF00' },
                { value: 4, color: '#00FF00' },
                { value: 6, color: '#00FFFF' },
                { value: 8, color: '#0000FF' },
                { value: 10, color: '#FF00FF' },
            ],
        })
        unmount()
    })

    it('mutations apply optimistically before the service round-trip', async () => {
        const { container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        expect(container.querySelectorAll('.mg-stop-marker')).toHaveLength(2)
        const add = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === 'Add',
        ) as HTMLButtonElement
        // No flushPromises between click and assert: the third marker must
        // appear from the local optimistic override, not from the refetch.
        act(() => { add.click() })
        expect(container.querySelectorAll('.mg-stop-marker')).toHaveLength(3)
        await flushPromises()
        unmount()
    })

    it('zoom-out widens the histogram request beyond the stop range', async () => {
        const { cm, container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        const zoomOut = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === '-',
        ) as HTMLButtonElement
        await act(async () => { zoomOut.click() })
        // histogram fetch is debounced ~100ms on domain changes
        await act(async () => {
            await new Promise((r) => setTimeout(r, 200))
        })
        // fit domain = stop range [0,10]; zoomed out x1.5 -> [-2.5, 12.5],
        // then aligned onto the nice 0.2 grid -> [-2.6, 12.6] / 76 bins
        expect(cm.invokeService).toHaveBeenCalledWith('getMultiGradHistogram', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            min: expect.closeTo(-2.6, 5),
            max: expect.closeTo(12.6, 5),
            nbins: 76,
        })
        unmount()
    })

    it('pan shifts the histogram request by a quarter span', async () => {
        const { cm, container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        const panRight = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent === '>',
        ) as HTMLButtonElement
        await act(async () => { panRight.click() })
        await act(async () => {
            await new Promise((r) => setTimeout(r, 200))
        })
        // fit domain [0,10] shifted right by 25% of the span -> [2.5, 12.5];
        // 2.5/12.5 already sit on the nice 0.1 grid -> 100 bins
        expect(cm.invokeService).toHaveBeenCalledWith('getMultiGradHistogram', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            min: expect.closeTo(2.5, 5),
            max: expect.closeTo(12.5, 5),
            nbins: 100,
        })
        unmount()
    })

    it('with no stops the fit domain falls back to the central-95% range', async () => {
        const cm = makeCm({
            coloringState: MAP_REND_MULTIGRAD,
            multiGradState: {
                ...MULTIGRAD_STATE,
                nodes: [],
            },
        })
        const handle = mountTree(
            <ColorPane cm={cm as never} sceneId={SCENE_ID} />,
        )
        await flushPromises()
        await act(async () => {
            await new Promise((r) => setTimeout(r, 200))
        })
        // percentile range from the mock, not the raw map min/max;
        // [0.5, 9.5] sits on the nice 0.1 grid -> 90 bins
        expect(cm.invokeService).toHaveBeenCalledWith('getMultiGradHistogram', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            min: expect.closeTo(0.5, 5),
            max: expect.closeTo(9.5, 5),
            nbins: 90,
        })
        handle.unmount()
    })

    it('a sparse map floors the bin width instead of splitting further', async () => {
        // Same view as the zoom test, but a map with few voxels outside a
        // dominant peak: 10 * 10 / (1200 - 200) = 0.1 -> nice width 0.1.
        // Without the floor the ~87-bin target would have asked for
        // 10/87 = 0.115 -> 0.2 ... so we assert the *floor* path by
        // zooming in, where the unfloored width would be far finer.
        const cm = makeCm({
            coloringState: MAP_REND_MULTIGRAD,
            multiGradState: {
                ...MULTIGRAD_STATE,
                mapVoxelCount: 1200,
                mapPeakCount: 200,
            },
        })
        const handle = mountTree(
            <ColorPane cm={cm as never} sceneId={SCENE_ID} />,
        )
        await flushPromises()
        // zoom in twice: span 10 -> 4.44, so the unfloored width would be
        // 4.44/87 = 0.051 -> nice 0.1 ... floor is 0.1 too, so go deeper
        const zoomIn = Array.from(handle.container.querySelectorAll('button'))
            .find((b) => b.textContent === '+') as HTMLButtonElement
        for (let i = 0; i < 6; i++) {
            await act(async () => { zoomIn.click() })
        }
        await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
        const calls = cm.invokeService.mock.calls.filter(
            (c) => c[0] === 'getMultiGradHistogram',
        )
        const last = calls[calls.length - 1][1] as {
            min: number; max: number; nbins: number
        }
        // the floor (0.1) caps the resolution: bin width stays 0.1 no
        // matter how far we zoom, so the request has few, wide bins.
        const binWidth = (last.max - last.min) / last.nbins
        expect(binWidth).toBeCloseTo(0.1, 6)
        expect(last.nbins).toBeLessThan(30)
        handle.unmount()
    })

    it('Color map selector change fires setMultiGradColorMap', async () => {
        const { cm, container, unmount } = await mountWith(MAP_REND_MULTIGRAD)
        const select = Array.from(
            container.querySelectorAll('select'),
        ).find((s) => s.querySelector('option[value="map2"]')) as HTMLSelectElement
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLSelectElement.prototype, 'value',
            )!.set!
            setter.call(select, 'map2')
            select.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setMultiGradColorMap', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            mapName: 'map2',
        })
        unmount()
    })
})
