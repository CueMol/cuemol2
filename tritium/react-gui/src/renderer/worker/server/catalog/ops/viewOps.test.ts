/**
 * @file worker/server/catalog/ops/viewOps.test.ts
 * @description The two camera-like ops that must not touch the scene's
 * state: framing a selection leaves the object's own selection alone (the
 * difference from center_view, and the reason PyMOL's zoom uses it), and
 * showing a frame moves the frame without opening an undo transaction
 * (it is playback, not an edit).
 */

import { describe, it, expect, vi } from 'vitest'

const { scene } = vi.hoisted(() => ({
  scene: { getObject: (_id: number): unknown => null, startUndoTxn: (_l: string): void => undefined },
}))

vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({ getSceneOrNull: () => scene }))
vi.mock('@renderer/worker/server/services/select/getSelHitCount', () => ({ getSelHitCount: () => ({ count: 12 }) }))
vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({ makeSel: () => ({ __sel: true }) }))

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { OpContext } from '../op'
import { focusSelection } from './viewOps'
import { setFrame } from './moreOps'

const oc = { sceneId: 1, viewId: 2, callId: 'c', markMutated: vi.fn() } as unknown as OpContext

describe('focus_selection', () => {
  it("fits the view to the atoms without setting the object's selection", async () => {
    const setSel = vi.fn()
    const mol = {
      fitView2: vi.fn(),
      set sel(v: unknown) { setSel(v) },
    }
    scene.getObject = () => mol
    const view = {}
    const ctx = { sceMgr: { getView: () => view } } as unknown as WorkerContext

    const res = await focusSelection.run(ctx, { objId: 10, selection: 'resi 10:20', zoom: null }, oc)

    expect(res.ok).toBe(true)
    expect(mol.fitView2).toHaveBeenCalledWith(view, { __sel: true })
    expect(setSel).not.toHaveBeenCalled()
  })
})

describe('set_frame', () => {
  it('moves the frame without opening an undo transaction', async () => {
    const obj = { nframe: 5, frame: 0 }
    scene.getObject = () => obj
    const startUndoTxn = vi.spyOn(scene, 'startUndoTxn')

    const res = await setFrame.run({} as WorkerContext, { objId: 10, frame: 3 }, oc)

    expect(res.ok).toBe(true)
    expect(obj.frame).toBe(3)
    expect(startUndoTxn).not.toHaveBeenCalled()
    expect(setFrame.mutates).toBe(false)
    // Out of range is refused, not clamped: the caller decides that.
    expect((await setFrame.run({} as WorkerContext, { objId: 10, frame: 5 }, oc)).ok).toBe(false)
  })
})
