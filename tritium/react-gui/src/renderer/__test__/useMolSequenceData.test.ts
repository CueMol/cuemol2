/**
 * Pin Phase 1 contract of `useMolSequenceData`:
 *
 *   - on mount with a sceneId: a single invokeService('getSeqPanelData',
 *     { sceneId }) call (no per-mol/per-chain fan-out -- the worker
 *     does the iteration so the renderer pays one IPC round trip per
 *     refresh, not N x M).
 *   - rows is the worker's `rows` field verbatim.
 *
 * Per-mol incremental refresh (SEM_PROPCHG sel) and event-listener
 * subscription are stubbed; they're covered by direct handler tests
 * elsewhere when wired.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('../hooks/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

import { useMolSequenceData } from '../hooks/useMolSequenceData'
import { makeRenderHook, flushPromises } from './helpers/testHarness'

interface MockRow {
    molUid: number
    molName: string
    chainName: string
    residues: Array<{ index: string; name: string; single: string; sel: boolean }>
}

function makeCm(rowsByCall: MockRow[] | ((args: Record<string, unknown>) => MockRow[])) {
    const invokeService = vi.fn((name: string, args: Record<string, unknown>) => {
        if (name === 'getSeqPanelData') {
            const rows = typeof rowsByCall === 'function' ? rowsByCall(args) : rowsByCall
            return Promise.resolve({ rows })
        }
        return Promise.resolve(null)
    })
    return { invokeService } as unknown as Parameters<typeof useMolSequenceData>[0]['cm']
}

describe('useMolSequenceData', () => {
    beforeEach(() => vi.clearAllMocks())

    it('issues exactly one getSeqPanelData call per refresh (no fan-out)', async () => {
        const cm = makeCm([
            {
                molUid: 11, molName: '1CRN', chainName: 'A',
                residues: [{ index: '1', name: 'MET', single: 'M', sel: false }],
            },
            {
                molUid: 22, molName: '4bi3', chainName: 'B',
                residues: [{ index: '1', name: 'ALA', single: 'A', sel: true }],
            },
        ])
        const handle = makeRenderHook(() => useMolSequenceData({ cm, sceneId: 100 }))
        await flushPromises()

        const calls = (cm as unknown as { invokeService: ReturnType<typeof vi.fn> })
            .invokeService.mock.calls
        // Exactly one IPC -- this is the contract that protects against
        // re-introducing the N+1 fan-out.
        expect(calls).toHaveLength(1)
        expect(calls[0][0]).toBe('getSeqPanelData')
        expect(calls[0][1]).toEqual({ sceneId: 100 })

        expect(handle.result.rows).toHaveLength(2)
        expect(handle.result.rows[0].chainName).toBe('A')
        expect(handle.result.rows[1].residues[0].sel).toBe(true)
        handle.unmount()
    })

    it('returns empty rows when worker returns no rows', async () => {
        const cm = makeCm([])
        const handle = makeRenderHook(() => useMolSequenceData({ cm, sceneId: 100 }))
        await flushPromises()
        expect(handle.result.rows).toEqual([])
        handle.unmount()
    })

    it('skips fetch when cm is null', async () => {
        const handle = makeRenderHook(() =>
            useMolSequenceData({ cm: null, sceneId: 100 }),
        )
        await flushPromises()
        expect(handle.result.rows).toEqual([])
        handle.unmount()
    })

    it('refetch() re-issues a single bulk call', async () => {
        let nthCall = 0
        const cm = makeCm(() => {
            nthCall++
            return [
                {
                    molUid: 11, molName: '1CRN', chainName: 'A',
                    residues: [{
                        index: '1', name: 'MET', single: 'M',
                        // Flip sel between calls to prove rows update.
                        sel: nthCall === 2,
                    }],
                },
            ]
        })
        const handle = makeRenderHook(() => useMolSequenceData({ cm, sceneId: 100 }))
        await flushPromises()
        expect(handle.result.rows[0].residues[0].sel).toBe(false)
        handle.result.refetch()
        await flushPromises()
        expect(handle.result.rows[0].residues[0].sel).toBe(true)
        const calls = (cm as unknown as { invokeService: ReturnType<typeof vi.fn> })
            .invokeService.mock.calls
        expect(calls.filter((c) => c[0] === 'getSeqPanelData')).toHaveLength(2)
        handle.unmount()
    })
})
