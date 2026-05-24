/**
 * Pin Phase 1 wire-up of `SequencePanel`:
 *
 *   - empty-state placeholder when rows is empty.
 *   - the chain-name column lists "<chain>:<molname>" for every row.
 *   - left-click on a residue cell dispatches `toggleResidueSelection`
 *     with the right sceneId / molId / chainName / residueIndex.
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
vi.mock('../hooks/useMolSequenceData', () => ({
    useMolSequenceData: (opts: unknown) => useMolSequenceDataMock(opts),
}))

// useTheme requires a <ThemeProvider> at runtime. The seq panel only
// reads `theme` to re-key its color memo on theme change; a stub
// return value is enough for these wire-up tests.
vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { SequencePanel } from '../components/panels/SequencePanel'
import { mountTree, flushPromises } from './helpers/testHarness'

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

describe('SequencePanel', () => {
    beforeEach(() => {
        useMolSequenceDataMock.mockReset()
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

    it('dispatches toggleResidueSelection on left-click of a residue cell', async () => {
        useMolSequenceDataMock.mockReturnValue({
            rows: [
                {
                    molUid: 11,
                    molName: '1CRN',
                    chainName: 'A',
                    // Residue at column 5; cellW falls back to 12 in jsdom
                    // (see SequencePanel.measureCell), so column 5 spans
                    // x in [60, 72). Click in the middle.
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
        expect(canvas).not.toBeNull()
        // jsdom canvas.getContext returns null, so measureCell falls
        // back to { cellW: 12, rowH: 19 }. Column 5 spans x in [60, 72)
        // and the only row spans y in [0, 19); click at the middle.
        pinCanvasBoundingRect(canvas, {})

        await act(async () => {
            canvas.dispatchEvent(
                new MouseEvent('mousedown', {
                    bubbles: true,
                    button: 0,
                    clientX: 65,
                    clientY: 10,
                }),
            )
        })
        await flushPromises()

        expect(cm.invokeService).toHaveBeenCalledWith('toggleResidueSelection', {
            sceneId: 100,
            molId: 11,
            chainName: 'A',
            residueIndex: '5',
        })
        unmount()
    })
})
