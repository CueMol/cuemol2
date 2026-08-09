/**
 * @file __test__/sceneCommandsAutoScene.test.tsx
 * @description Pins the "load with no active view creates a scene" behaviour of
 * useSceneCommands. From the welcome tab (or after every molview tab is closed)
 * getActiveSceneInfo() is undefined; File > Open and Get PDB must then create a
 * fresh scene + view (a new tab) and load into it, instead of silently doing
 * nothing. An existing active scene is used as-is, and an unsupported file /
 * cancelled dialog must NOT leave a stray new tab.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider, useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from './helpers/testHarness'

const showFileOpenOptionDialog = vi.fn<(args: unknown) => Promise<unknown>>()
const showGetPdbDialog = vi.fn<() => Promise<unknown>>()
const showErrorAlert = vi.fn<(args: unknown) => Promise<void>>()

vi.mock('../components/fopen-opt-dlgs/FileOpenOptionDialogProvider', () => ({
  useShowFileOpenOptionDialog: () => showFileOpenOptionDialog,
}))
vi.mock('../components/dialogs/GetPdbDialogProvider', () => ({
  useShowGetPdbDialog: () => showGetPdbDialog,
}))
vi.mock('../components/dialogs/ErrorAlertDialogProvider', () => ({
  useShowErrorAlert: () => showErrorAlert,
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
  return {
    getCompatibleRendererNames: vi.fn(() =>
      Promise.resolve({ types: ['simple'], objType: 'MolCoord', readerName: 'pdb' }),
    ),
    loadObject: vi.fn((..._args: unknown[]) => Promise.resolve()),
    loadScene: vi.fn((..._args: unknown[]) => Promise.resolve()),
    invokeService: vi.fn(() => Promise.resolve(undefined)),
  }
}

const NEW_SCENE = {
  scene_uid: 99, view_uid: 100, scene_name: 'Untitled', view_name: '0', tab_title: 'Untitled:0',
}

function mountWith(
  cm: ReturnType<typeof makeCm>,
  getActiveSceneInfo: () => { scene_uid: number; view_id: number } | undefined,
  newScene: ReturnType<typeof vi.fn>,
) {
  return makeRenderHook(() => {
    useSceneCommands({ cm: cm as unknown as AsyncCueMol, getActiveSceneInfo, newScene })
    return useCommands()
  }, Wrapper)
}

/** Drain the detached async IIFE chain inside the command handlers. */
async function drain(): Promise<void> {
  for (let i = 0; i < 5; i++) await flushPromises()
}

describe('useSceneCommands - auto-create scene on load', () => {
  beforeEach(() => {
    setupElectronAPI()
    showFileOpenOptionDialog.mockReset()
    showGetPdbDialog.mockReset()
    showErrorAlert.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('OpenObjByPath with no active scene creates a new scene and loads into it', async () => {
    const cm = makeCm()
    showFileOpenOptionDialog.mockResolvedValue({})
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => undefined, newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.OpenObjByPath, { path: '/tmp/x.pdb' } as never)
    await drain()

    expect(newScene).toHaveBeenCalledTimes(1)
    expect(cm.loadObject).toHaveBeenCalledTimes(1)
    // loadObject(path, sceneId, options, contentFirst, undefined, readerName)
    expect(cm.loadObject.mock.calls[0][1]).toBe(NEW_SCENE.scene_uid)
    h.unmount()
  })

  it('OpenObjByPath with an active scene loads into it without creating one', async () => {
    const cm = makeCm()
    showFileOpenOptionDialog.mockResolvedValue({})
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => ({ scene_uid: 1, view_id: 2 }), newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.OpenObjByPath, { path: '/tmp/x.pdb' } as never)
    await drain()

    expect(newScene).not.toHaveBeenCalled()
    expect(cm.loadObject.mock.calls[0][1]).toBe(1)
    h.unmount()
  })

  it('OpenObjByPath with an unsupported file does not create a scene or load', async () => {
    const cm = makeCm()
    cm.getCompatibleRendererNames.mockResolvedValue({ types: [], objType: '', readerName: '' })
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => undefined, newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.OpenObjByPath, { path: '/tmp/x.xyz' } as never)
    await drain()

    expect(newScene).not.toHaveBeenCalled()
    expect(showErrorAlert).toHaveBeenCalledTimes(1)
    expect(cm.loadObject).not.toHaveBeenCalled()
    h.unmount()
  })

  it('OpenObjByPath cancelled option dialog does not load (scene may exist)', async () => {
    const cm = makeCm()
    showFileOpenOptionDialog.mockResolvedValue(null)
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => undefined, newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.OpenObjByPath, { path: '/tmp/x.pdb' } as never)
    await drain()

    expect(cm.loadObject).not.toHaveBeenCalled()
    h.unmount()
  })

  it('UiGetPdbDialog cancelled does not create a scene', async () => {
    const cm = makeCm()
    showGetPdbDialog.mockResolvedValue(null)
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => undefined, newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.UiGetPdbDialog)
    await drain()

    expect(newScene).not.toHaveBeenCalled()
    h.unmount()
  })
})

/**
 * UXP openSceneImpl parity: opening a .qsc into a "just created" (empty &
 * unmodified) current scene loads in place without a new tab; a non-empty /
 * modified scene (or no active scene) makes a fresh scene + tab instead.
 */
describe('useSceneCommands - open scene into just-created scene', () => {
  beforeEach(() => {
    setupElectronAPI()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  /** cm whose isSceneJustCreated query resolves to the given verdict. */
  function makeSceneCm(justCreated: boolean) {
    const cm = makeCm()
    cm.invokeService = vi.fn((name: string) =>
      name === 'isSceneJustCreated'
        ? Promise.resolve({ justCreated })
        : Promise.resolve(undefined),
    ) as unknown as typeof cm.invokeService
    return cm
  }

  it('reuses the active scene in place when it is just created', async () => {
    const cm = makeSceneCm(true)
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => ({ scene_uid: 7, view_id: 8 }), newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.OpenSceneByPath, '/tmp/a.qsc' as never)
    await drain()

    expect(cm.invokeService).toHaveBeenCalledWith('isSceneJustCreated', { sceneId: 7 })
    expect(newScene).not.toHaveBeenCalled()
    expect(cm.loadScene).toHaveBeenCalledTimes(1)
    // loadScene(path, sceneId) -> loads into the existing active scene (7).
    expect(cm.loadScene.mock.calls[0][1]).toBe(7)
    h.unmount()
  })

  it('creates a new scene when the active scene is not just created', async () => {
    const cm = makeSceneCm(false)
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => ({ scene_uid: 7, view_id: 8 }), newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.OpenSceneByPath, '/tmp/a.qsc' as never)
    await drain()

    expect(newScene).toHaveBeenCalledTimes(1)
    expect(cm.loadScene).toHaveBeenCalledTimes(1)
    // Loads into the freshly created scene, not the active one.
    expect(cm.loadScene.mock.calls[0][1]).toBe(NEW_SCENE.scene_uid)
    h.unmount()
  })

  it('creates a new scene (no empty-check) when no scene is active', async () => {
    const cm = makeSceneCm(true)
    const newScene = vi.fn(() => Promise.resolve(NEW_SCENE))
    const h = mountWith(cm, () => undefined, newScene)
    await flushPromises()

    await h.result.dispatch(CmdId.OpenSceneByPath, '/tmp/a.qsc' as never)
    await drain()

    expect(cm.invokeService).not.toHaveBeenCalled()
    expect(newScene).toHaveBeenCalledTimes(1)
    expect(cm.loadScene.mock.calls[0][1]).toBe(NEW_SCENE.scene_uid)
    h.unmount()
  })
})

describe('useSceneCommands - renderer preset supply (ADR-0046)', () => {
  beforeEach(() => {
    setupElectronAPI()
    showFileOpenOptionDialog.mockReset()
    showGetPdbDialog.mockReset()
    showErrorAlert.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    teardownElectronAPI()
    vi.restoreAllMocks()
  })

  it('OpenObjByPath fetches getRendPresetTypes after scene resolution and forwards presetTypes', async () => {
    const cm = makeCm()
    const PRESETS = [{ name: 'Default1RendPreset', desc: 'Default preset 1' }]
    ;(cm.invokeService as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string) =>
        name === 'getRendPresetTypes'
          ? Promise.resolve({ presets: PRESETS })
          : Promise.resolve(undefined),
    )
    showFileOpenOptionDialog.mockResolvedValue(null) // cancel -> no load
    const h = mountWith(cm, () => ({ scene_uid: 5, view_id: 6 }), vi.fn())
    await flushPromises()

    await h.result.dispatch(CmdId.OpenObjByPath, { path: '/tmp/x.pdb' } as never)
    await drain()

    expect(cm.invokeService).toHaveBeenCalledWith('getRendPresetTypes', {
      sceneId: 5, objClassName: 'MolCoord',
    })
    expect(showFileOpenOptionDialog).toHaveBeenCalledWith(
      expect.objectContaining({ presetTypes: PRESETS }),
    )
    h.unmount()
  })

  it('degrades to an empty preset list when the service resolves undefined', async () => {
    const cm = makeCm() // invokeService resolves undefined by default
    showFileOpenOptionDialog.mockResolvedValue(null)
    const h = mountWith(cm, () => ({ scene_uid: 5, view_id: 6 }), vi.fn())
    await flushPromises()

    await h.result.dispatch(CmdId.OpenObjByPath, { path: '/tmp/x.pdb' } as never)
    await drain()

    expect(showFileOpenOptionDialog).toHaveBeenCalledWith(
      expect.objectContaining({ presetTypes: [] }),
    )
    h.unmount()
  })
})
