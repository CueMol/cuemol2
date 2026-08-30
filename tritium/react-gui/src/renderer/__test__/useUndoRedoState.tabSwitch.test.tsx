/**
 * Regression test: undo/redo state must follow the ACTIVE scene.
 *
 * The hook used to key its tab-switch effect on the molview id and read the
 * scene uid back through a callback at effect time. The tab list resolves the
 * new scene one render later, so the snapshot and the event listener were
 * scoped to the previous scene; edits on the new tab never refreshed the
 * state and Undo / Redo stayed disabled until the next switch.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { makeRenderHook } from '@renderer/__test__/helpers/testHarness'
import { CommandProvider } from '@renderer/commands/CommandRegistry'
import { useUndoRedoState } from '@renderer/hooks/useUndoRedoState'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'

void React
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

interface Listener { scope: number; fire: (args: unknown) => void }

/** cm whose getUndoState answers per scene and whose listeners are capturable. */
function makeCm(undoable: Record<number, boolean>) {
  const listeners: Listener[] = []
  const cm = {
    invokeService: vi.fn((name: string, args: { sceneId: number }) => {
      if (name !== 'getUndoState') return Promise.resolve({ ok: true })
      const canUndo = undoable[args.sceneId] ?? false
      return Promise.resolve({ canUndo, canRedo: false, undoDescs: canUndo ? ['edit'] : [], redoDescs: [] })
    }),
    addEventListener: vi.fn(async (_c: string, _s: number, _e: number, scope: number, fire: (a: unknown) => void) => {
      listeners.push({ scope, fire })
      return listeners.length
    }),
    removeEventListener: vi.fn(async () => undefined),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
  }
  return { cm: cm as unknown as AsyncCueMol, raw: cm, listeners }
}

const settle = async (): Promise<void> => {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}
const undoStateCalls = (raw: ReturnType<typeof makeCm>['raw']): number[] =>
  raw.invokeService.mock.calls.filter((c) => c[0] === 'getUndoState').map((c) => (c[1] as { sceneId: number }).sceneId)

afterEach(() => vi.useRealTimers())

describe('useUndoRedoState follows the active scene', () => {
  it('snapshots and subscribes for the scene that is active, and re-scopes on switch', async () => {
    const { cm, raw, listeners } = makeCm({ 1: true, 2: false })
    let sceneId: number | undefined = 1
    const h = makeRenderHook(() => useUndoRedoState({ cm, activeSceneId: sceneId }), Wrapper)
    await settle()
    expect(undoStateCalls(raw)).toEqual([1])
    expect(listeners.map((l) => l.scope)).toEqual([1])
    expect(h.result.canUndo).toBe(true)

    sceneId = 2
    h.rerender()
    await settle()
    // The new scene's snapshot, and a listener on the new scene (the old one
    // is dropped).
    expect(undoStateCalls(raw)).toEqual([1, 2])
    expect(listeners.map((l) => l.scope)).toEqual([1, 2])
    expect(raw.removeEventListener).toHaveBeenCalledTimes(1)
    expect(h.result.canUndo).toBe(false)
    h.unmount()
  })

  it('an edit committed on the newly active scene re-enables Undo', async () => {
    const undoable: Record<number, boolean> = { 1: true, 2: false }
    const { cm, raw, listeners } = makeCm(undoable)
    let sceneId: number | undefined = 1
    const h = makeRenderHook(() => useUndoRedoState({ cm, activeSceneId: sceneId }), Wrapper)
    await settle()
    sceneId = 2
    h.rerender()
    await settle()
    expect(h.result.canUndo).toBe(false)

    // A commit on scene 2 fires SCE_SCENE_UNDOINFO on scene 2's listener.
    undoable[2] = true
    const onScene2 = listeners.find((l) => l.scope === 2)!
    await act(async () => {
      onScene2.fire({ evtType: 0, srcUID: 2 })
      await new Promise((r) => setTimeout(r, 60)) // past the burst debounce
    })
    await settle()
    expect(undoStateCalls(raw)).toEqual([1, 2, 2])
    expect(h.result.canUndo).toBe(true)
    h.unmount()
  })

  it('undo / redo act on the active scene, then refresh it', async () => {
    const { cm, raw } = makeCm({ 1: true, 2: true })
    let sceneId: number | undefined = 1
    const h = makeRenderHook(() => useUndoRedoState({ cm, activeSceneId: sceneId }), Wrapper)
    await settle()
    sceneId = 2
    h.rerender()
    await settle()

    act(() => h.result.pickUndo(0))
    await settle()
    expect(raw.undo).toHaveBeenCalledWith(2, 0)
    expect(undoStateCalls(raw).at(-1)).toBe(2)
    h.unmount()
  })

  it('with no active scene the state is empty and nothing is subscribed', async () => {
    const { cm, raw, listeners } = makeCm({})
    const h = makeRenderHook(() => useUndoRedoState({ cm, activeSceneId: undefined }), Wrapper)
    await settle()
    expect(undoStateCalls(raw)).toEqual([])
    expect(listeners).toHaveLength(0)
    expect(h.result.canUndo).toBe(false)
    expect(h.result.canRedo).toBe(false)
    h.unmount()
  })
})
