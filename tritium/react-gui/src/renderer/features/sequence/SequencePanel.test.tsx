/**
 * Pin the wire-up of `SequencePanel`:
 *
 *   - empty-state placeholder when rows is empty.
 *   - the chain-name column lists "<chain>:<molname>" for every row.
 *   - plain click (pointerdown + pointerup on same residue) dispatches
 *     `toggleResidueSelection` and `centerOnResidue`.
 *   - drag (pointerdown on residue A, pointerup on residue B in same
 *     chain) dispatches `rangeSelectResidues` with toggle=true.
 *   - shift+click (pointerdown shift, pointerup on same residue with
 *     an existing marker) dispatches `rangeSelectResidues` with
 *     toggle=false.
 *   - context menu items wire up to the corresponding worker services
 *     and clipboard call: Around / Around Byresid /
 *     Unselect all / Invert sel via `selectObjectMol`; Copy sequence
 *     via `navigator.clipboard.writeText`.
 *
 * Drawing logic is not pinned (Canvas calls aren't readable in jsdom);
 * the contract under test is the React-side click wiring.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const useMolSequenceDataMock = vi.fn()
vi.mock('./useMolSequenceData', () => ({
    useMolSequenceData: (opts: unknown) => useMolSequenceDataMock(opts),
}))

// useTheme requires a <ThemeProvider> at runtime. The seq panel only
// reads `theme` to re-key its color memo on theme change; a stub
// return value is enough for these wire-up tests.
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

// Capture the menu JSX passed to `showContextMenu` so the context-menu tests
// can mount it standalone and click individual items without going
// through Blueprint's portal layer.
const showContextMenuMock = vi.fn()
vi.mock('@blueprintjs/core', async () => {
    const actual = await vi.importActual<typeof import('@blueprintjs/core')>(
        '@blueprintjs/core',
    )
    return {
        ...actual,
        showContextMenu: (props: unknown) => showContextMenuMock(props),
    }
})

import { SequencePanel } from './SequencePanel'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

function makeCm(): MockCm {
    return {
        invokeService: vi.fn(() => Promise.resolve({ ok: true })),
    }
}

function pinCanvasBoundingRect(canvas: HTMLCanvasElement, rect: Partial<DOMRect>) {
    canvas.getBoundingClientRect = () =>
        ({
            left: 0,
            top: 0,
            right: 800,
            bottom: 400,
            width: 800,
            height: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
            ...rect,
        } as DOMRect)
}

/**
 * jsdom doesn't expose `PointerEvent` globally, but React's pointer
 * handlers just listen for the DOM event by name -- a `MouseEvent`
 * dispatched with `type: 'pointerdown'` (etc.) fires the same React
 * handler. We patch `pointerId` on so the React synthetic event has
 * a value to mirror.
 */
function makePointerEvent(
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    opts: { clientX: number; clientY: number; pointerId?: number; shiftKey?: boolean },
): MouseEvent {
    const ev = new MouseEvent(type, {
        bubbles: true,
        button: 0,
        clientX: opts.clientX,
        clientY: opts.clientY,
        shiftKey: opts.shiftKey,
    })
    if (opts.pointerId !== undefined) {
        Object.defineProperty(ev, 'pointerId', { value: opts.pointerId })
    }
    return ev
}

describe('SequencePanel', () => {
    beforeEach(() => {
        useMolSequenceDataMock.mockReset()
        showContextMenuMock.mockReset()
    })

    it('shows the empty-state placeholder when rows is empty', () => {
        useMolSequenceDataMock.mockReturnValue({
            rows: [],
            loading: false,
            refetch: () => undefined,
        })
        const { container, unmount } = mountTree(
            <SequencePanel cm={makeCm() as unknown as never} activeSceneId={100} activeMolViewId={7} />,
        )
        expect(container.textContent).toContain('No molecule loaded')
        unmount()
    })

    it('renders one chain-name row per (mol, chain) tuple from rows', () => {
        useMolSequenceDataMock.mockReturnValue({
            rows: [
                {
                    molUid: 11,
                    molName: '1CRN',
                    chainName: 'A',
                    residues: [{ index: '5', name: 'MET', single: 'M', sel: false }],
                },
                {
                    molUid: 22,
                    molName: '4bi3',
                    chainName: 'B',
                    residues: [{ index: '1', name: 'ALA', single: 'A', sel: false }],
                },
            ],
            loading: false,
            refetch: () => undefined,
        })
        const { container, unmount } = mountTree(
            <SequencePanel cm={makeCm() as unknown as never} activeSceneId={100} activeMolViewId={7} />,
        )
        const labels = Array.from(container.querySelectorAll('.seq-name-item')).map(
            (n) => n.textContent,
        )
        expect(labels).toEqual(['A:1CRN', 'B:4bi3'])
        // No molecule selector dropdown in the seq panel.
        expect(container.querySelector('select')).toBeNull()
        unmount()
    })

    it('plain click (pointerdown + pointerup on same residue) toggles + centers', async () => {
        useMolSequenceDataMock.mockReturnValue({
            rows: [
                {
                    molUid: 11,
                    molName: '1CRN',
                    chainName: 'A',
                    // jsdom getContext returns null, measureCell falls
                    // back to cellW=12, rowH=19. Column 5 spans
                    // x in [60, 72); the only row spans y in [0, 19).
                    residues: [
                        { index: '5', name: 'GLY', single: 'G', sel: false },
                    ],
                },
            ],
            loading: false,
            refetch: () => undefined,
        })
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SequencePanel cm={cm as unknown as never} activeSceneId={100} activeMolViewId={7} />,
        )
        const canvas = container.querySelector('.seq-canvas') as HTMLCanvasElement
        pinCanvasBoundingRect(canvas, {})

        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerdown', {
                    pointerId: 1,
                    clientX: 65, clientY: 10,
                }),
            )
        })
        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerup', {
                    pointerId: 1,
                    clientX: 65, clientY: 10,
                }),
            )
        })
        await flushPromises()

        const calls = cm.invokeService.mock.calls.map((c) => c[0])
        expect(calls).toContain('toggleResidueSelection')
        expect(calls).toContain('centerOnResidue')
        expect(calls).not.toContain('rangeSelectResidues')
        const toggleCall = cm.invokeService.mock.calls.find(
            (c) => c[0] === 'toggleResidueSelection',
        )!
        expect(toggleCall[1]).toEqual({
            sceneId: 100, molId: 11, chainName: 'A', residueIndex: '5',
        })
        unmount()
    })

    it('drag (pointerdown on residue A, pointerup on residue B) range-selects with toggle=true', async () => {
        useMolSequenceDataMock.mockReturnValue({
            rows: [
                {
                    molUid: 11,
                    molName: '1CRN',
                    chainName: 'A',
                    residues: [
                        { index: '3', name: 'ALA', single: 'A', sel: false },
                        { index: '7', name: 'GLY', single: 'G', sel: false },
                    ],
                },
            ],
            loading: false,
            refetch: () => undefined,
        })
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SequencePanel cm={cm as unknown as never} activeSceneId={100} activeMolViewId={7} />,
        )
        const canvas = container.querySelector('.seq-canvas') as HTMLCanvasElement
        pinCanvasBoundingRect(canvas, {})

        // Column 3 starts at x=36, column 7 starts at x=84 (cellW=12).
        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerdown', {
                    pointerId: 1,
                    clientX: 40, clientY: 10,
                }),
            )
        })
        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerup', {
                    pointerId: 1,
                    clientX: 90, clientY: 10,
                }),
            )
        })
        await flushPromises()

        const rangeCall = cm.invokeService.mock.calls.find(
            (c) => c[0] === 'rangeSelectResidues',
        )
        expect(rangeCall).toBeDefined()
        expect(rangeCall![1]).toEqual({
            sceneId: 100, molId: 11, chainName: 'A',
            fromIndex: '3', toIndex: '7', toggle: true,
        })
        // Drag must not also fire toggle or center.
        expect(cm.invokeService.mock.calls.map((c) => c[0])).not.toContain(
            'toggleResidueSelection',
        )
        expect(cm.invokeService.mock.calls.map((c) => c[0])).not.toContain('centerOnResidue')
        unmount()
    })

    it('shift+click on a different residue (with existing marker) range-selects with toggle=false', async () => {
        useMolSequenceDataMock.mockReturnValue({
            rows: [
                {
                    molUid: 11,
                    molName: '1CRN',
                    chainName: 'A',
                    residues: [
                        { index: '3', name: 'ALA', single: 'A', sel: false },
                        { index: '7', name: 'GLY', single: 'G', sel: false },
                    ],
                },
            ],
            loading: false,
            refetch: () => undefined,
        })
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SequencePanel cm={cm as unknown as never} activeSceneId={100} activeMolViewId={7} />,
        )
        const canvas = container.querySelector('.seq-canvas') as HTMLCanvasElement
        pinCanvasBoundingRect(canvas, {})

        // First click on column 3 places the marker.
        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerdown', {
                    pointerId: 1,
                    clientX: 40, clientY: 10,
                }),
            )
        })
        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerup', {
                    pointerId: 1,
                    clientX: 40, clientY: 10,
                }),
            )
        })
        await flushPromises()
        cm.invokeService.mockClear()

        // Shift+click on column 7 -- but pointerup with same xy as
        // pointerdown so the "same position" branch + shiftKey hits
        // the rangeSelect-from-marker path.
        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerdown', {
                    pointerId: 2,
                    clientX: 90, clientY: 10, shiftKey: true,
                }),
            )
        })
        await act(async () => {
            canvas.dispatchEvent(
                makePointerEvent('pointerup', {
                    pointerId: 2,
                    clientX: 90, clientY: 10, shiftKey: true,
                }),
            )
        })
        await flushPromises()

        const rangeCall = cm.invokeService.mock.calls.find(
            (c) => c[0] === 'rangeSelectResidues',
        )
        expect(rangeCall).toBeDefined()
        expect(rangeCall![1]).toEqual({
            sceneId: 100, molId: 11, chainName: 'A',
            fromIndex: '3', toIndex: '7', toggle: false,
        })
        unmount()
    })

    // ---- context menu wiring ----

    /**
     * Right-click the seq canvas to trigger the ctx menu, then render
     * the captured menu JSX inline so individual items are clickable.
     * Returns the menu container + the cleanup for the panel mount.
     */
    function setupCtxMenu(cm: MockCm) {
        useMolSequenceDataMock.mockReturnValue({
            rows: [
                {
                    molUid: 11,
                    molName: '1CRN',
                    chainName: 'A',
                    residues: [
                        { index: '3', name: 'ALA', single: 'A', sel: false },
                        { index: '5', name: 'GLY', single: 'G', sel: false },
                        // Test ligand fallback: empty single -> '*'
                        { index: '6', name: 'HOH', single: '', sel: false },
                    ],
                },
            ],
            loading: false,
            refetch: () => undefined,
        })
        const { container: panelContainer, unmount: unmountPanel } = mountTree(
            <SequencePanel
                cm={cm as unknown as never}
                activeSceneId={100}
                activeMolViewId={7}
            />,
        )
        const canvas = panelContainer.querySelector('.seq-canvas') as HTMLCanvasElement
        pinCanvasBoundingRect(canvas, {})
        // Right-click on column 5 (x in [60, 72) at cellW=12).
        act(() => {
            canvas.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true, clientX: 65, clientY: 10,
                }),
            )
        })
        expect(showContextMenuMock).toHaveBeenCalledTimes(1)
        const args = showContextMenuMock.mock.calls[0][0] as { content: React.ReactElement }
        const { container: menuContainer, unmount: unmountMenu } = mountTree(
            args.content,
        )
        return {
            menuContainer,
            cleanup() {
                unmountMenu()
                unmountPanel()
            },
        }
    }

    /**
     * Resolve a menu item by exact label text and return the underlying
     * Blueprint anchor element (which carries the onClick handler).
     */
    function findMenuItem(menuContainer: HTMLElement, text: string): HTMLElement | null {
        const items = Array.from(menuContainer.querySelectorAll('.bp5-menu-item'))
        for (const it of items) {
            // Blueprint nests the label inside .bp5-text-overflow-ellipsis
            const label = it.querySelector('.bp5-text-overflow-ellipsis')?.textContent ?? ''
            if (label.trim() === text) return it as HTMLElement
        }
        return null
    }

    it('Phase 3: Toggle sel menu item dispatches toggleResidueSelection', async () => {
        const cm = makeCm()
        const { menuContainer, cleanup } = setupCtxMenu(cm)
        cm.invokeService.mockClear()
        const item = findMenuItem(menuContainer, 'Toggle sel')
        expect(item).not.toBeNull()
        await act(async () => {
            item!.click()
        })
        await flushPromises()
        const call = cm.invokeService.mock.calls.find((c) => c[0] === 'toggleResidueSelection')
        expect(call).toBeDefined()
        expect(call![1]).toEqual({
            sceneId: 100, molId: 11, chainName: 'A', residueIndex: '5',
        })
        cleanup()
    })

    it.each([
        ['Unselect all', 'unselect'],
        ['Invert sel', 'invert'],
    ])('Phase 3: %s dispatches selectObjectMol(kind=%s)', async (label, kind) => {
        const cm = makeCm()
        const { menuContainer, cleanup } = setupCtxMenu(cm)
        cm.invokeService.mockClear()
        const item = findMenuItem(menuContainer, label)
        expect(item).not.toBeNull()
        await act(async () => {
            item!.click()
        })
        await flushPromises()
        const call = cm.invokeService.mock.calls.find((c) => c[0] === 'selectObjectMol')
        expect(call).toBeDefined()
        expect(call![1]).toEqual({ sceneId: 100, objId: 11, kind })
        cleanup()
    })

    it('Phase 3: Copy sequence writes the chain letters to the clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true,
        })
        const cm = makeCm()
        const { menuContainer, cleanup } = setupCtxMenu(cm)
        const item = findMenuItem(menuContainer, 'Copy sequence')
        expect(item).not.toBeNull()
        await act(async () => {
            item!.click()
        })
        await flushPromises()
        // Residues: '3' A, '5' G, '6' '' -> '*'. UXP `copySeq` glosses
        // the empty single letter as '*'.
        expect(writeText).toHaveBeenCalledWith('AG*')
        cleanup()
    })
})
