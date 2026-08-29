/**
 * @file worker/server/services/animProgress.test.ts
 * @description What the worker pushes while an animation plays.
 *
 * C++ advances playback on its own timer and fires no per-frame event, so the
 * worker samples the manager on the render loop it already runs. These pin
 * the three things that keep that cheap -- it follows a scene only while it
 * is playing, sends nothing when nothing moved, and caps the rate -- and the
 * one thing that keeps it safe: it holds no manager of its own, so closing a
 * scene mid-playback really ends it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ANIM_PROGRESS_CHANNEL } from '@renderer/worker/shared/animTypes'
import type { AnimMgrState } from '@renderer/worker/shared/animTypes'

const postMessage = vi.fn()
vi.stubGlobal('self', { postMessage })

/** A fake AnimMgr whose readings the test moves. */
function fakeMgr(state: { elapsed: number; playState: string; length?: number }) {
  return {
    get elapsed() { return { millisec: state.elapsed } },
    get length() { return { millisec: state.length ?? 5000 } },
    get playState() { return state.playState },
    get loop() { return false },
    get startcam() { return '' },
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }
}

let mod: typeof import('./animation.service')
let live: { elapsed: number; playState: string }
let mgr: ReturnType<typeof fakeMgr>
/** The context the render loop pumps with; a test may close its scene. */
let env: ReturnType<typeof ctxWith>
let pumpCtx: never

/**
 * A worker context whose scene hands back our manager. `close()` makes the
 * scene stop resolving, as closing a tab does.
 */
function ctxWith(m: unknown) {
  let scene: unknown = { uid: 1, getAnimMgr: () => m, getUID: () => 1 }
  const ctx = {
    sceMgr: {
      getScene: () => scene,
      getView: () => ({ uid: 7 }),
    },
  }
  return { ctx: ctx as never, close: () => { scene = null } }
}

const pushes = (): AnimMgrState[] =>
  postMessage.mock.calls
    .filter((c) => (c[0] as unknown[])[0] === ANIM_PROGRESS_CHANNEL)
    .map((c) => ((c[0] as unknown[])[1] as { mgr: AnimMgrState }).mgr)

beforeEach(async () => {
  vi.resetModules()
  postMessage.mockClear()
  mod = await import('./animation.service')
  live = { elapsed: 0, playState: 'play' }
  mgr = fakeMgr(live)
  env = ctxWith(mgr)
  pumpCtx = env.ctx
})
afterEach(() => { mod.clearAnimProgressWatches() })

describe('animation progress pushes', () => {
  it('sends nothing until a scene is playing', () => {
    mod.pumpAnimProgress(pumpCtx, 1000)
    expect(pushes()).toEqual([])
  })

  it('follows a scene once play starts, and reports what moved', () => {
    mod.services.animPlay(env.ctx, { sceneId: 1, viewId: 7 })
    mod.pumpAnimProgress(pumpCtx, 1000)
    expect(pushes()).toHaveLength(1)
    expect(pushes()[0]).toMatchObject({ elapsedMs: 0, playState: 'play' })

    live.elapsed = 800
    mod.pumpAnimProgress(pumpCtx, 1100)
    expect(pushes()).toHaveLength(2)
    expect(pushes()[1]).toMatchObject({ elapsedMs: 800 })
  })

  it('sends nothing when nothing moved', () => {
    mod.services.animPlay(env.ctx, { sceneId: 1, viewId: 7 })
    mod.pumpAnimProgress(pumpCtx, 1000)
    mod.pumpAnimProgress(pumpCtx, 2000)
    mod.pumpAnimProgress(pumpCtx, 3000)
    expect(pushes()).toHaveLength(1)
  })

  it('caps the rate -- a frame arriving too soon waits', () => {
    mod.services.animPlay(env.ctx, { sceneId: 1, viewId: 7 })
    mod.pumpAnimProgress(pumpCtx, 1000)
    live.elapsed = 16
    mod.pumpAnimProgress(pumpCtx, 1016) // 16 ms later: too soon
    expect(pushes()).toHaveLength(1)
    live.elapsed = 70
    mod.pumpAnimProgress(pumpCtx, 1070)
    expect(pushes()).toHaveLength(2)
  })

  it('sends a last snapshot when playback ends, then stops following', () => {
    mod.services.animPlay(env.ctx, { sceneId: 1, viewId: 7 })
    mod.pumpAnimProgress(pumpCtx, 1000)
    postMessage.mockClear()

    // Reaching the end is not something the renderer asked for, so the final
    // state has to arrive on its own -- and immediately, not on the next
    // rate-limited tick.
    live.playState = 'stop'
    live.elapsed = 0
    mod.pumpAnimProgress(pumpCtx, 1001)
    expect(pushes()).toHaveLength(1)
    expect(pushes()[0]).toMatchObject({ playState: 'stop' })

    postMessage.mockClear()
    mod.pumpAnimProgress(pumpCtx, 2000)
    expect(pushes()).toEqual([])
  })

  it('stops following when the renderer pauses or stops -- its reply is the truth', () => {
    mod.services.animPlay(env.ctx, { sceneId: 1, viewId: 7 })
    mod.services.animPause(env.ctx, { sceneId: 1 })
    postMessage.mockClear()
    live.elapsed = 900
    mod.pumpAnimProgress(pumpCtx, 5000)
    expect(pushes()).toEqual([])
  })

  it('lets go of a scene closed mid-playback', () => {
    // Holding the manager across frames would pin the native object: the
    // closed scene kept its timer running and kept drawing over whatever was
    // opened next. Only the id is kept, so a closed scene stops resolving.
    mod.services.animPlay(env.ctx, { sceneId: 1, viewId: 7 })
    mod.pumpAnimProgress(pumpCtx, 1000)
    expect(pushes()).toHaveLength(1)

    env.close()
    postMessage.mockClear()
    live.elapsed = 900
    expect(() => mod.pumpAnimProgress(pumpCtx, 1100)).not.toThrow()
    expect(pushes()).toEqual([])

    // ... and it is not picked up again on a later frame.
    mod.pumpAnimProgress(pumpCtx, 5000)
    expect(pushes()).toEqual([])
  })
})
