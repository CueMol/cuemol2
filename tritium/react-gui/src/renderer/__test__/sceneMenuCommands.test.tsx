/**
 * @file __test__/sceneMenuCommands.test.tsx
 * @description Pins the Scene menu bar commands wired in useSceneCommands:
 *   - SceneColorProof -> toggleSceneColorProofing on the active scene
 *   - SceneProperties -> showSceneProperty(activeScene.scene_uid)
 * Both no-op when no scene is active. Mirrors the scene-tree context menu's
 * Use color proofing / Properties... items, but targets the active scene.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider, useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from './helpers/testHarness'

vi.mock('../components/fopen-opt-dlgs/FileOpenOptionDialogProvider', () => ({
  useShowFileOpenOptionDialog: () => vi.fn(),
}))
vi.mock('../components/dialogs/GetPdbDialogProvider', () => ({
  useShowGetPdbDialog: () => vi.fn(),
}))
vi.mock('../components/dialogs/ErrorAlertDialogProvider', () => ({
  useShowErrorAlert: () => vi.fn(),
}))
vi.mock('../components/dialogs/StreamProgressDialogProvider', () => ({
  useStreamProgressDialog: () => ({ show: vi.fn(), hide: vi.fn(), update: vi.fn() }),
}))
vi.mock('../components/dialogs/pdbIdHistory', () => ({ pushHistory: vi.fn() }))
vi.mock('../commands/addRecent', () => ({ addRecent: vi.fn() }))
vi.mock('../components/dialogs/OpenMdTrajDialogProvider', () => ({
  useShowOpenMdTrajDialog: () => vi.fn(),
}))
vi.mock('../components/dialogs/NewRendererDialogProvider', () => ({
  useShowNewRendererDialog: () => vi.fn(),
}))

import { useSceneCommands } from '../commands/useSceneCommands'

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

function makeCm() {
  return { invokeService: vi.fn(() => Promise.resolve({ ok: true, enabled: true })) }
}

const NEW_SCENE = { scene_uid: 0, view_uid: 0, scene_name: '', view_name: '', tab_title: '' }

function mountWith(
  cm: ReturnType<typeof makeCm>,
  getActiveSceneInfo: () => { scene_uid: number; view_id: number } | undefined,
  showSceneProperty: ReturnType<typeof vi.fn>,
) {
  return makeRenderHook(() => {
    useSceneCommands({
      cm: cm as unknown as AsyncCueMol,
      getActiveSceneInfo,
      showSceneProperty,
      newScene: vi.fn(() => Promise.resolve(NEW_SCENE)) as never,
      openSceneFile: vi.fn(() => Promise.resolve({ ok: true, ...NEW_SCENE })) as never,
    })
    return useCommands()
  }, Wrapper)
}

async function drain(): Promise<void> {
  for (let i = 0; i < 3; i++) await flushPromises()
}

describe('useSceneCommands - Scene menu commands', () => {
  beforeEach(() => setupElectronAPI())
  afterEach(() => teardownElectronAPI())

  it('SceneColorProof toggles color proofing on the active scene', async () => {
    const cm = makeCm()
    const h = mountWith(cm, () => ({ scene_uid: 7, view_id: 8 }), vi.fn())
    await h.result.dispatch(CmdId.SceneColorProof)
    await drain()
    expect(cm.invokeService).toHaveBeenCalledWith('toggleSceneColorProofing', { sceneId: 7 })
    h.unmount()
  })

  it('SceneProperties opens the active scene in the inspector', async () => {
    const cm = makeCm()
    const showSceneProperty = vi.fn()
    const h = mountWith(cm, () => ({ scene_uid: 7, view_id: 8 }), showSceneProperty)
    await h.result.dispatch(CmdId.SceneProperties)
    await drain()
    expect(showSceneProperty).toHaveBeenCalledWith(7)
    h.unmount()
  })

  it('both are no-ops when no scene is active', async () => {
    const cm = makeCm()
    const showSceneProperty = vi.fn()
    const h = mountWith(cm, () => undefined, showSceneProperty)
    await h.result.dispatch(CmdId.SceneColorProof)
    await h.result.dispatch(CmdId.SceneProperties)
    await drain()
    expect(cm.invokeService).not.toHaveBeenCalledWith('toggleSceneColorProofing', expect.anything())
    expect(showSceneProperty).not.toHaveBeenCalled()
    h.unmount()
  })
})
