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

// Colour field seam: a button that fires onCommit with a fixed colour.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
    CueColorField: ({
        onCommit,
    }: {
        onCommit: (v: string) => void
    }) => (
        <button
            type="button"
            data-testid="color-commit"
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

const SCENE_ID = 7
const VIEW_ID = 5
const REND_ID = 200
const OBJ_ID = 11

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

/**
 * cm mock: listMapRenderers exposes one renderer (auto-selected), and
 * getMapRendererState returns a full state with the chosen useAbsLevel.
 */
function makeCm(useAbsLevel: boolean): MockCm {
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
                        alpha: 1, color: '#ffffff', extent: 10,
                        siglevel: 1.5, useAbsLevel,
                        maxLevel: 5, minLevel: -5, maxExtent: 100, denSigma: 1,
                        defaults: { alpha: false, siglevel: false, extent: false },
                    },
                })
            }
            return Promise.resolve({ ok: true })
        }),
    }
}

async function mountPane(useAbsLevel = false) {
    const cm = makeCm(useAbsLevel)
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
})
