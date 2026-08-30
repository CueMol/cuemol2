/**
 * @file worker/server/services/animPauseInactive.test.ts
 * @description Pausing playback in the scenes that are not in front.
 *
 * Only one view draws to the shared canvas, so an animation playing in a
 * background tab moves a camera nobody sees. Activating a view pauses the
 * others -- except a scene an animation render is driving, which steps the
 * manager itself and would stall.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pauseInactivePlayback } from './anim/anim.service'

vi.stubGlobal('self', { postMessage: vi.fn() })

/** A manager whose play state the test sets; pause() records itself. */
function fakeMgr(playState: string) {
  return {
    playState,
    pause: vi.fn(function (this: { playState: string }) { this.playState = 'pause' }),
    get elapsed() { return { millisec: 0 } },
    get length() { return { millisec: 1000 } },
    get loop() { return false },
    get startcam() { return '' },
  }
}

function ctxWith(scenes: Record<number, ReturnType<typeof fakeMgr>>) {
  return {
    sceMgr: {
      scene_uids: Object.keys(scenes).join(','),
      getScene: (uid: number) => (scenes[uid] ? { uid, getAnimMgr: () => scenes[uid] } : null),
    },
  } as never
}

const never = () => false

beforeEach(() => vi.clearAllMocks())

describe('pauseInactivePlayback', () => {
  it('pauses the playing scenes that are not the active one', () => {
    const a = fakeMgr('play'), b = fakeMgr('play'), c = fakeMgr('play')
    const paused = pauseInactivePlayback(ctxWith({ 1: a, 2: b, 3: c }), 2, never)
    expect(paused).toEqual([1, 3])
    expect(a.pause).toHaveBeenCalled()
    expect(c.pause).toHaveBeenCalled()
    expect(b.pause).not.toHaveBeenCalled()
  })

  it('leaves scenes that are not playing alone', () => {
    const stopped = fakeMgr('stop'), pausedAlready = fakeMgr('pause')
    const paused = pauseInactivePlayback(ctxWith({ 1: stopped, 2: pausedAlready }), 9, never)
    expect(paused).toEqual([])
    expect(stopped.pause).not.toHaveBeenCalled()
    expect(pausedAlready.pause).not.toHaveBeenCalled()
  })

  it('leaves a scene an animation render is driving alone', () => {
    const rendering = fakeMgr('play'), other = fakeMgr('play')
    const paused = pauseInactivePlayback(
      ctxWith({ 1: rendering, 2: other }), 9, (uid) => uid === 1,
    )
    expect(paused).toEqual([2])
    expect(rendering.pause).not.toHaveBeenCalled()
  })

  it('pauses everything playing when no view is active', () => {
    const a = fakeMgr('play')
    expect(pauseInactivePlayback(ctxWith({ 1: a }), undefined, never)).toEqual([1])
  })
})
