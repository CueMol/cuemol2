/**
 * Degrade-detection wire tests for DensityMapPane (UXP panel.density-map port).
 *
 * Pins the OBSERVABLE renderer-side wire of the pane's mutation actions whose
 * service names are NOT already covered by another pane's wire test:
 *
 *   - "Use absolute contour level" menu -> setMapRendererProp
 *       { propName: 'use_abslevel', value: true } (and the no-op guard:
 *       picking the already-active mode fires NOTHING);
 *   - color commit                       -> setMapRendererProp { propName: 'color', value }
 *   - "Redraw" button                    -> redrawMapCenter { sceneId, rendId, viewId }
 *   - coloring scope: the pane edits the solid color only. The mode menu has
 *     no multi-gradient entry and no gradient editor is embedded (both moved
 *     to the Coloring panel); the swatch is disabled outside solid colormode
 *     while "Solid color" stays available as the way back.
 *
 * (showUnitCellRenderer / Cell is already pinned by symmetryPaneWire.test.tsx
 * at the same wire, so it is intentionally not re-tested here; the numeric
 * DragRow realtime-drag path is covered by the realtime-drag hook tests.)
 *
 * Asserts wire + gating only -- no readout markup, class names, or state.
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

// Colour field seam: a button that fires onCommit with a fixed colour and
// surfaces `disabled` so the colormode gating can be asserted.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
    CueColorField: ({
        onCommit,
        disabled,
    }: {
        onCommit: (v: string) => void
        disabled?: boolean
    }) => (
        <button
            type="button"
            data-testid="color-commit"
            disabled={disabled}
            onClick={() => onCommit('#445566')}
        />
    ),
}))
vi.mock('../h3-kit/colorpicker/ColorPickerContext', () => ({
    ColorPickerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useColorPickerCtx: () => ({ cm: null, sceneId: undefined }),
}))

import { DensityMapPane } from '../components/panes/DensityMapPane'
import { mountTree, flushPromises } from './helpers/testHarness'

// jsdom has no ResizeObserver; the gradient stop bar observes its width.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub

const SCENE_ID = 7
const VIEW_ID = 5
const REND_ID = 200
const OBJ_ID = 11

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

/**
 * cm mock: listMapRenderers exposes one renderer (auto-selected), and
 * getMapRendererState returns a full state with the chosen useAbsLevel /
 * colormode. The multigrad reads keep the inline MultiGradSection happy.
 */
function makeCm(useAbsLevel: boolean, colormode = 'solid'): MockCm {
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'listMapRenderers') {
                return Promise.resolve({
                    items: [
                        {
                            rendId: REND_ID,
                            objId: OBJ_ID,
                            objName: 'map1',
                            rendName: 'rend1',
                        },
                    ],
                })
            }
            if (name === 'getMapRendererState') {
                return Promise.resolve({
                    state: {
                        alpha: 1, color: '#ffffff', colormode, extent: 10,
                        siglevel: 1.5, useAbsLevel,
                        maxLevel: 5, minLevel: -5, maxExtent: 100, denSigma: 1,
                        regionResolved: 'box', mapType: 'xtal',
                        defaults: { alpha: false, siglevel: false, extent: false },
                    },
                })
            }
            if (name === 'getMultiGradState') {
                return Promise.resolve({
                    ok: true,
                    capable: true,
                    colormode,
                    colorMapName: 'map1',
                    nodes: [
                        { value: 0, color: '#FF0000', hex: '#FF0000' },
                        { value: 10, color: '#FFFFFF', hex: '#FFFFFF' },
                    ],
                    mapObjects: [
                        { objId: OBJ_ID, name: 'map1', className: 'DensityMap' },
                    ],
                    mapStats: { min: 0, max: 10, mean: 5, sigma: 1, quantStep: 0 },
                })
            }
            if (name === 'getMultiGradHistogram') {
                return Promise.resolve({ ok: true, histo: [], nmax: 0 })
            }
            return Promise.resolve({ ok: true })
        }),
    }
}

async function mountPane(useAbsLevel = false, colormode = 'solid') {
    const cm = makeCm(useAbsLevel, colormode)
    const handle = mountTree(
        <DensityMapPane
            cm={cm as never}
            activeSceneId={SCENE_ID}
            activeMolViewId={VIEW_ID}
        />,
    )
    await flushPromises()
    return { cm, ...handle }
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement
}

function mutationCalls(cm: MockCm): Array<[string, unknown]> {
    const reads = new Set(['listMapRenderers', 'getMapRendererState'])
    return cm.invokeService.mock.calls.filter(
        (c) => !reads.has(c[0] as string),
    ) as Array<[string, unknown]>
}

describe('DensityMapPane wire', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('"Use absolute contour level" menu fires setMapRendererProp use_abslevel=true', async () => {
        // Current mode is sigma (useAbsLevel false); switching to absolute commits.
        const { cm, container, unmount } = await mountPane(false)
        const caret = container.querySelector(
            'button[aria-label="Level mode"]',
        ) as HTMLButtonElement
        await act(async () => { caret.click() })
        await flushPromises()
        const items = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ) as HTMLElement[]
        const absItem = items.find((el) =>
            el.textContent?.includes('Use absolute contour level'),
        )
        expect(absItem).toBeTruthy()
        await act(async () => { absItem!.click() })
        await flushPromises()
        // Full payload pinned with toEqual (not objectContaining) so a stray
        // extra field would also fail. The level-mode toggle carries no write
        // opts, so mode/originalValue/originalWasDefault are explicitly
        // undefined.
        expect(cm.invokeService).toHaveBeenCalledWith(
            'setMapRendererProp',
            {
                sceneId: SCENE_ID,
                rendId: REND_ID,
                propName: 'use_abslevel',
                value: true,
                mode: undefined,
                originalValue: undefined,
                originalWasDefault: undefined,
            },
        )
        unmount()
    })

    it('no-op guard: picking the already-active level mode fires no service', async () => {
        // Already in sigma mode; picking "Use sigma contour level" is a no-op.
        const { cm, container, unmount } = await mountPane(false)
        const caret = container.querySelector(
            'button[aria-label="Level mode"]',
        ) as HTMLButtonElement
        await act(async () => { caret.click() })
        await flushPromises()
        const items = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ) as HTMLElement[]
        const sigmaItem = items.find((el) =>
            el.textContent?.includes('Use sigma contour level'),
        )
        await act(async () => { sigmaItem!.click() })
        await flushPromises()
        expect(mutationCalls(cm)).toEqual([])
        unmount()
    })

    it('color commit fires setMapRendererProp with propName color', async () => {
        const { cm, container, unmount } = await mountPane(false)
        const swatch = container.querySelector(
            '[data-testid="color-commit"]',
        ) as HTMLElement
        await act(async () => { swatch.click() })
        await flushPromises()
        // Full payload pinned with toEqual; color commit carries no write opts.
        expect(cm.invokeService).toHaveBeenCalledWith(
            'setMapRendererProp',
            {
                sceneId: SCENE_ID,
                rendId: REND_ID,
                propName: 'color',
                value: '#445566',
                mode: undefined,
                originalValue: undefined,
                originalWasDefault: undefined,
            },
        )
        unmount()
    })

    it('"Redraw" button fires redrawMapCenter with sceneId/rendId/viewId', async () => {
        const { cm, container, unmount } = await mountPane(false)
        const redraw = buttonByText(container, 'Redraw')
        expect(redraw.disabled).toBe(false)
        await act(async () => { redraw.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('redrawMapCenter', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            viewId: VIEW_ID,
        })
        unmount()
    })

    // --- Multi-gradient color mode ---

    async function openModeMenu(container: HTMLElement) {
        const caret = container.querySelector(
            'button[aria-label="Level mode"]',
        ) as HTMLButtonElement
        await act(async () => { caret.click() })
        await flushPromises()
        return Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ) as HTMLElement[]
    }

    // Coloring beyond the plain solid color belongs to the Coloring panel:
    // this pane must not offer a second way in.
    it('the mode menu offers no multi-gradient entry', async () => {
        const { container, unmount } = await mountPane(false, 'solid')
        const items = await openModeMenu(container)
        expect(
            items.some((el) => el.textContent?.includes('Multi-gradient')),
        ).toBe(false)
        expect(
            items.some((el) => el.textContent?.includes('Solid color')),
        ).toBe(true)
        unmount()
    })

    it('"Solid color" menu in multigrad mode fires colormode=solid', async () => {
        const { cm, container, unmount } = await mountPane(false, 'multigrad')
        const items = await openModeMenu(container)
        const solidItem = items.find((el) =>
            el.textContent?.includes('Solid color'),
        )
        await act(async () => { solidItem!.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setMapRendererProp', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            propName: 'colormode',
            value: 'solid',
            mode: undefined,
            originalValue: undefined,
            originalWasDefault: undefined,
        })
        unmount()
    })

    // The swatch stays mounted outside solid colormode but goes inactive --
    // it must never write a color the renderer does not draw.
    it('the swatch is disabled outside solid colormode and never embeds a gradient editor', async () => {
        const mg = await mountPane(false, 'multigrad')
        const mgSwatch = mg.container.querySelector(
            '[data-testid="color-commit"]',
        ) as HTMLButtonElement
        expect(mgSwatch).not.toBeNull()
        expect(mgSwatch.disabled).toBe(true)
        expect(mg.container.querySelector('.mg-stopbar')).toBeNull()
        mg.unmount()

        const solid = await mountPane(false, 'solid')
        const solidSwatch = solid.container.querySelector(
            '[data-testid="color-commit"]',
        ) as HTMLButtonElement
        expect(solidSwatch.disabled).toBe(false)
        expect(solid.container.querySelector('.mg-stopbar')).toBeNull()
        solid.unmount()
    })
})
