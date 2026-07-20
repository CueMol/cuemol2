/**
 * Behavior tests for useTrajPlayback (JS-timer trajectory playback).
 *
 * Pins the frame-cursor contract the pane depends on:
 *   - commit clamps to [0, nframe-1] and seeks via setTrajectoryFrame
 *   - previewFrame changes the displayed frame WITHOUT seeking (scrub preview)
 *   - skip-to-start / end commit the boundary frames
 *   - a playback tick advances one frame and seeks
 *   - transport is disabled (canControl false) when there are no frames
 */

import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeRenderHook } from './helpers/testHarness'
import { useTrajPlayback } from '../hooks/useTrajPlayback'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

function makeCm() {
    return {
        invokeService: vi.fn((name: string, args: { frame?: number }) => {
            if (name === 'setTrajectoryFrame') return Promise.resolve({ ok: true, frame: args.frame })
            if (name === 'getTrajectoryState')
                return Promise.resolve({ ok: true, nframe: 10, frame: 0, blocks: [] })
            return Promise.resolve({})
        }),
        addEventListener: vi.fn(() => Promise.resolve(1)),
        removeEventListener: vi.fn(() => Promise.resolve()),
    } as unknown as AsyncCueMol
}

type Opts = Parameters<typeof useTrajPlayback>[0]

describe('useTrajPlayback', () => {
    beforeEach(() => vi.clearAllMocks())
    afterEach(() => vi.restoreAllMocks())

    it('commit clamps to the last frame and seeks', () => {
        const cm = makeCm()
        const props: Opts = { cm, sceneId: 1, objId: 42, nframe: 10, baseFrame: 0 }
        const h = makeRenderHook(() => useTrajPlayback(props))
        act(() => h.result.commit(100))
        expect(h.result.frame).toBe(9)
        expect(cm.invokeService).toHaveBeenCalledWith('setTrajectoryFrame', {
            sceneId: 1,
            objId: 42,
            frame: 9,
        })
        h.unmount()
    })

    it('previewFrame updates the displayed frame without seeking', () => {
        const cm = makeCm()
        const props: Opts = { cm, sceneId: 1, objId: 42, nframe: 10, baseFrame: 0 }
        const h = makeRenderHook(() => useTrajPlayback(props))
        act(() => h.result.previewFrame(5))
        expect(h.result.frame).toBe(5)
        expect(cm.invokeService).not.toHaveBeenCalled()
        // Clearing the preview reverts to the committed frame (0).
        act(() => h.result.previewFrame(null))
        expect(h.result.frame).toBe(0)
        h.unmount()
    })

    it('skipToStart / skipToEnd commit the boundary frames', () => {
        const cm = makeCm()
        const props: Opts = { cm, sceneId: 1, objId: 42, nframe: 10, baseFrame: 4 }
        const h = makeRenderHook(() => useTrajPlayback(props))
        act(() => h.result.skipToEnd())
        expect(h.result.frame).toBe(9)
        act(() => h.result.skipToStart())
        expect(h.result.frame).toBe(0)
        h.unmount()
    })

    it('a playback tick advances one frame and seeks', () => {
        let timerCb: (() => void) | null = null
        vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: () => void) => {
            timerCb = cb
            return 123 as unknown as ReturnType<typeof setInterval>
        }) as typeof setInterval)
        vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})

        const cm = makeCm()
        const props: Opts = { cm, sceneId: 1, objId: 42, nframe: 10, baseFrame: 0 }
        const h = makeRenderHook(() => useTrajPlayback(props))

        act(() => h.result.play())
        expect(h.result.isPlaying).toBe(true)
        expect(timerCb).not.toBeNull()

        act(() => timerCb && timerCb())
        expect(h.result.frame).toBe(1)
        expect(cm.invokeService).toHaveBeenCalledWith('setTrajectoryFrame', {
            sceneId: 1,
            objId: 42,
            frame: 1,
        })
        h.unmount()
    })

    it('canControl is false without frames', () => {
        const cm = makeCm()
        const props: Opts = { cm, sceneId: 1, objId: 42, nframe: 0, baseFrame: 0 }
        const h = makeRenderHook(() => useTrajPlayback(props))
        expect(h.result.canControl).toBe(false)
        h.unmount()
    })
})
