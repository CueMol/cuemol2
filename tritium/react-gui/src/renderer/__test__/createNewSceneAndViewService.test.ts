/**
 * What a new scene's initial properties contract is.
 *
 * The New Tab dialog's settings (and the preference remembering them) reach
 * C++ through `createNewSceneAndView`. Three things about how they are written
 * are load-bearing and none of them are visible from the call site:
 *
 *   1. NO undo transaction. `Scene::isModified()` is driven by the undo stack,
 *      so a transaction here would mark a scene the user has not touched as
 *      modified -- which prompts to save on close and disqualifies the scene
 *      from the in-place `.qsc` load path (`isSceneJustCreated`).
 *   2. A property already holding the requested value is NOT written. Writing
 *      it would clear its "still at the default" flag and make the saved
 *      `.qsc` carry an entry that says nothing.
 *   3. Enabling colour proofing seeds a profile when none is set -- the same
 *      pairing `toggleSceneColorProofing` holds, since proofing with no
 *      profile does nothing.
 */

import { describe, it, expect, vi } from 'vitest'
import { fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'
import type { Scene } from '@cuemol/core/src/wrappers/Scene'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import {
  applyInitialSceneProps,
  createNewSceneAndView,
  INITIAL_SCENE_PROP_KEYS,
  resetInitialSceneProps,
} from '@renderer/worker/server/services/scene/createNewSceneAndView'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

/** A colour the fake `compileColor` returns; compares by its channels. */
function color(r: number, g: number, b: number) {
  return { r: () => r, g: () => g, b: () => b }
}

const BLACK = color(0, 0, 0)

/** The channels of a colour a spy recorded. */
function rgbOf(c: unknown): [number, number, number] {
  const col = c as ReturnType<typeof color>
  return [col.r(), col.g(), col.b()]
}

/**
 * Add accessor-spied properties to a fake, the way the harness spies the ones
 * it models. The AA / AO properties are Scene-only, so `fakeScene` does not
 * carry them.
 */
function addSpiedProps(
  target: Record<string, unknown>,
  initial: Record<string, unknown>,
): void {
  const sets = target.sets as Record<string, ReturnType<typeof vi.fn>>
  const values = { ...initial }
  for (const key of Object.keys(initial)) {
    const spy = vi.fn()
    sets[key] = spy
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get: () => values[key],
      set: (v: unknown) => {
        spy(v)
        values[key] = v
      },
    })
  }
}

/** A scene at the C++ defaults (Scene.qif), plus the `resetProp` fake. */
function makeScene() {
  const resetProp = vi.fn()
  const scene = fakeScene({
    uid: 100,
    views: [fakeView({ uid: 7 })],
    bgcolor: BLACK,
    use_colproof: false,
    icc_filename: '',
  })
  addSpiedProps(scene as unknown as Record<string, unknown>, {
    aa_method: 'fxaa',
    aaJitterLevel: 0,
    aoEnabled: false,
    aoRadius: 4,
    aoSteps: 3,
    aoIntensity: 2.2,
    aoHalfRes: false,
  })
  Object.assign(scene, { resetProp })
  return { scene, resetProp }
}

/** A ctx whose `compileColor` maps the few colour strings these tests use. */
function makeCtx(scene: ReturnType<typeof makeScene>['scene']) {
  const { ctx } = makeWorkerCtx({
    scenes: [scene],
    extra: {
      styleMgr: {
        compileColor: vi.fn((str: string) =>
          str === '#ffffff' ? color(255, 255, 255) : BLACK,
        ),
      },
    },
  })
  return ctx as unknown as WorkerContext
}

describe('applyInitialSceneProps', () => {
  it('writes the properties that differ from the current value', () => {
    const { scene } = makeScene()
    applyInitialSceneProps(makeCtx(scene), scene as unknown as Scene, {
      aa_method: 'smaa',
      aaJitterLevel: 3,
      aoEnabled: true,
      aoRadius: 12,
      bgcolor: '#ffffff',
    })

    expect(scene.sets.aa_method).toHaveBeenCalledWith('smaa')
    expect(scene.sets.aaJitterLevel).toHaveBeenCalledWith(3)
    expect(scene.sets.aoEnabled).toHaveBeenCalledWith(true)
    expect(scene.sets.aoRadius).toHaveBeenCalledWith(12)
    // Compare the colour by its channels: two `compileColor` results holding
    // the same RGB are still distinct objects.
    expect(rgbOf(scene.sets.bgcolor.mock.calls[0][0])).toEqual([255, 255, 255])
  })

  it('skips a property already holding the requested value', () => {
    const { scene } = makeScene()
    // Every value here is the C++ default the fake scene starts at.
    applyInitialSceneProps(makeCtx(scene), scene as unknown as Scene, {
      aa_method: 'fxaa',
      aaJitterLevel: 0,
      aoEnabled: false,
      aoRadius: 4,
      aoSteps: 3,
      aoIntensity: 2.2,
      aoHalfRes: false,
      bgcolor: '#000000',
      use_colproof: false,
    })

    for (const key of ['aa_method', 'aaJitterLevel', 'aoEnabled', 'aoRadius',
      'aoSteps', 'aoIntensity', 'aoHalfRes', 'bgcolor', 'use_colproof']) {
      expect(scene.sets[key]).not.toHaveBeenCalled()
    }
  })

  it('seeds an ICC profile when proofing is enabled with none set', () => {
    const { scene } = makeScene()
    applyInitialSceneProps(makeCtx(scene), scene as unknown as Scene, {
      use_colproof: true,
    })

    expect(scene.sets.use_colproof).toHaveBeenCalledWith(true)
    expect(scene.sets.icc_filename).toHaveBeenCalledWith('GenericCMYK.icm')
  })

  it('leaves a configured ICC profile alone', () => {
    const { scene } = makeScene()
    scene.icc_filename = 'MyProfile.icc'
    scene.sets.icc_filename.mockClear() // the line above went through the spy
    applyInitialSceneProps(makeCtx(scene), scene as unknown as Scene, {
      use_colproof: true,
    })

    expect(scene.sets.icc_filename).not.toHaveBeenCalled()
  })
})

describe('createNewSceneAndView', () => {
  it('applies the initial properties without opening an undo transaction', () => {
    const { scene } = makeScene()
    const ctx = makeWorkerCtx({
      scenes: [scene],
      extra: {
        sceMgr: { createScene: vi.fn(() => scene) },
        styleMgr: { compileColor: vi.fn(() => color(255, 255, 255)) },
      },
    }).ctx as unknown as WorkerContext

    createNewSceneAndView(ctx, {
      dpr: 1,
      name: 'Untitled 1',
      bindView: false,
      initialProps: { aoEnabled: true, bgcolor: '#ffffff' },
    })

    expect(scene.sets.aoEnabled).toHaveBeenCalledWith(true)
    // An undo entry here would make the untouched scene read as modified.
    expect(scene.undo.started).toEqual([])
    expect(scene.undo.committed).toEqual([])
  })
})

describe('resetInitialSceneProps', () => {
  it('resets every property applyInitialSceneProps can write', () => {
    const { scene, resetProp } = makeScene()
    resetInitialSceneProps(scene as unknown as Scene)

    expect(resetProp.mock.calls.map((c) => c[0])).toEqual([...INITIAL_SCENE_PROP_KEYS])
  })

  it('keeps going when one property cannot be reset', () => {
    const { scene, resetProp } = makeScene()
    resetProp.mockImplementationOnce(() => {
      throw new Error('read only')
    })
    resetInitialSceneProps(scene as unknown as Scene)

    expect(resetProp).toHaveBeenCalledTimes(INITIAL_SCENE_PROP_KEYS.length)
  })
})
