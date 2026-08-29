/**
 * Degrade-detection wire tests for SymmetryPane (UXP panel.symmetry port).
 *
 * Pins the OBSERVABLE renderer-side wire of the pane's two mutation actions
 * (fire-and-forget through `fireService` -> `invokeService`):
 *
 *   - "Symm mol" menu item N -> showSymmRenderer { sceneId, objId, viewId, extent }
 *   - "Unit cell" button     -> showUnitCellRenderer { sceneId, objId }
 *
 * and the gating that guards them:
 *   - showSymmRenderer requires an active view AND hasInfo && cellOk && isMol;
 *   - showUnitCellRenderer requires hasInfo && cellOk (object's mol-ness is
 *     not required) -- so a disabled button fires nothing.
 *
 * It does NOT assert the crystal-info readout markup, button class names, or
 * React state -- only the wire + gating. The object enumeration (ObjectSelect)
 * and the Change... dialog are mocked to seams; their own behavior is covered
 * elsewhere (this pane only forwards the selected objId).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

// ObjectSelect seam: auto-selects a fixed object uid on mount so the pane's
// selectedObjId is populated without driving the real listSceneObjects flow.
const SELECTED_OBJ_ID = 42
vi.mock('../h3-kit/ObjectSelect', () => ({
    objectFilters: { molCoordOrDensityMap: () => true },
    ObjectSelect: ({
        onChange,
    }: {
        onChange: (uid: number | undefined) => void
    }) => {
        React.useEffect(() => { onChange(SELECTED_OBJ_ID) }, [])
        return <div data-testid="object-select" />
    },
}))

// The Change... dialog is not under test here.
vi.mock('../components/dialogs/SymmetryChangeDialogProvider', () => ({
    useShowSymmetryChangeDialog: () => vi.fn(() => Promise.resolve({ ok: false })),
}))

import { SymmetryPane } from '../components/panes/SymmetryPane'
import { mountTree, flushPromises } from './helpers/testHarness'

const SCENE_ID = 7
const VIEW_ID = 5

interface InfoFlags {
    hasInfo?: boolean
    isMol?: boolean
    cellOk?: boolean
    objectExists?: boolean
}

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

/**
 * cm mock: getSymmetryPanelInfo returns the chosen gating flags; mutation
 * services resolve ok. Cell params present so the readout renders.
 */
function makeCm(flags: InfoFlags): MockCm {
    const {
        hasInfo = true, isMol = true, cellOk = true, objectExists = true,
    } = flags
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'getSymmetryPanelInfo') {
                return Promise.resolve({
                    info: {
                        lattice: 'CUBIC', hm_spacegroup: 'P 21 21 21',
                        a: 40, b: 50, c: 60, alpha: 90, beta: 90, gamma: 90,
                    },
                    objectExists, hasInfo, isMol, cellOk,
                })
            }
            return Promise.resolve({ ok: true })
        }),
    }
}

async function mountPane(flags: InfoFlags, opts?: { viewId?: number | undefined }) {
    const cm = makeCm(flags)
    const handle = mountTree(
        <SymmetryPane
            cm={cm as never}
            activeSceneId={SCENE_ID}
            activeMolViewId={opts && 'viewId' in opts ? opts.viewId : VIEW_ID}
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
    return cm.invokeService.mock.calls.filter(
        (c) => c[0] !== 'getSymmetryPanelInfo',
    ) as Array<[string, unknown]>
}

describe('SymmetryPane wire', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('Symm mol "50 A" item fires showSymmRenderer with extent 50', async () => {
        const { cm, container, unmount } = await mountPane({})
        // Open the "Symm mol" popover.
        const symmBtn = buttonByText(container, 'Symm mol')
        expect(symmBtn.disabled).toBe(false)
        await act(async () => { symmBtn.click() })
        await flushPromises()
        const items = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ) as HTMLElement[]
        const item50 = items.find((el) => el.textContent?.includes('50'))
        expect(item50).toBeTruthy()
        await act(async () => { item50!.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('showSymmRenderer', {
            sceneId: SCENE_ID,
            objId: SELECTED_OBJ_ID,
            viewId: VIEW_ID,
            extent: 50,
        })
        unmount()
    })

    it('Symm mol "Unit cell" item fires showSymmRenderer with extent "unitcell"', async () => {
        const { cm, container, unmount } = await mountPane({})
        await act(async () => { buttonByText(container, 'Symm mol').click() })
        await flushPromises()
        const items = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ) as HTMLElement[]
        const unitItem = items.find((el) => el.textContent?.trim() === 'Unit cell')
        await act(async () => { unitItem!.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('showSymmRenderer', {
            sceneId: SCENE_ID,
            objId: SELECTED_OBJ_ID,
            viewId: VIEW_ID,
            extent: 'unitcell',
        })
        unmount()
    })

    it('"Unit cell" button fires showUnitCellRenderer with sceneId/objId', async () => {
        const { cm, container, unmount } = await mountPane({})
        const cellBtn = buttonByText(container, 'Unit cell')
        expect(cellBtn.disabled).toBe(false)
        await act(async () => { cellBtn.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('showUnitCellRenderer', {
            sceneId: SCENE_ID,
            objId: SELECTED_OBJ_ID,
        })
        unmount()
    })

    it('gating: when cell is too small (cellOk false) Symm mol + Unit cell are disabled and fire nothing', async () => {
        const { cm, container, unmount } = await mountPane({ cellOk: false })
        expect(buttonByText(container, 'Symm mol').disabled).toBe(true)
        expect(buttonByText(container, 'Unit cell').disabled).toBe(true)
        await act(async () => { buttonByText(container, 'Unit cell').click() })
        await flushPromises()
        expect(mutationCalls(cm)).toEqual([])
        unmount()
    })

    it('gating: showSymmRenderer is suppressed when no active view is available', async () => {
        // hasInfo/cellOk/isMol all true, but no active view -> the handler
        // guard returns early even though the button is enabled.
        const { cm, container, unmount } = await mountPane({}, { viewId: undefined })
        await act(async () => { buttonByText(container, 'Symm mol').click() })
        await flushPromises()
        const items = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ) as HTMLElement[]
        const item20 = items.find((el) => el.textContent?.includes('20'))
        await act(async () => { item20!.click() })
        await flushPromises()
        expect(
            cm.invokeService.mock.calls.some((c) => c[0] === 'showSymmRenderer'),
        ).toBe(false)
        unmount()
    })
})
