/**
 * Degrade-detection test for useFileCommands (File menu: Save File As /
 * Save current view / Reload Scene).
 *
 * Pins the handler wire contract: which worker services / dialogs each
 * command invokes, and the early-out gates (no src, cancelled dialog,
 * declined confirm, empty object list).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { CommandProvider, useCommands } from '../commands/CommandRegistry'
import { CmdId } from '../commands/ids'
import { IPC } from '../../shared/ipcChannels'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from './helpers/testHarness'

// Dialog provider hooks are mocked so the test controls their resolved value.
const showObjectPicker = vi.fn<(args: unknown) => Promise<number | null>>()
const showConfirmReload = vi.fn<(args: unknown) => Promise<boolean>>()
vi.mock('../components/dialogs/ObjectPickerDialogProvider', () => ({
  useShowObjectPicker: () => showObjectPicker,
}))
vi.mock('../components/dialogs/ConfirmReloadSceneDialogProvider', () => ({
  useShowConfirmReloadSceneDialog: () => showConfirmReload,
}))

import { useFileCommands } from '../commands/useFileCommands'

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

type Routes = Record<string, (args: unknown) => unknown>

function makeCm(routes: Routes, closeInfo?: unknown) {
  const invokeService = vi.fn((name: string, args: unknown) =>
    Promise.resolve(routes[name] ? routes[name](args) : undefined),
  )
  const getSceneCloseInfo = vi.fn(() => Promise.resolve(closeInfo))
  return { invokeService, getSceneCloseInfo }
}

const SCENE_INFO = { scene_uid: 1, view_id: 2 }

async function mountWith(cm: ReturnType<typeof makeCm>) {
  const h = makeRenderHook(() => {
    useFileCommands({
      cm: cm as unknown as AsyncCueMol,
      getActiveSceneInfo: () => SCENE_INFO,
    })
    return useCommands()
  }, Wrapper)
  await flushPromises()
  return h
}

describe('useFileCommands', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setupElectronAPI()
    showObjectPicker.mockReset()
    showConfirmReload.mockReset()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })
  afterEach(() => {
    teardownElectronAPI()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
  })

  // ─── SaveCurrentView ────────────────────────────────────────────────────

  it('SaveCurrentView: view -> __current camera -> dialog -> saveCameraToFile', async () => {
    const cm = makeCm({
      saveViewToCamera: () => ({ ok: true }),
      saveCameraToFile: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: '/tmp/view.cam',
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.SaveCurrentView)

    expect(cm.invokeService).toHaveBeenCalledWith('saveViewToCamera', {
      sceneId: 1, viewId: 2, name: '__current', withVisFlags: false,
    })
    expect(window.electronAPI.invoke).toHaveBeenCalledWith(
      IPC.DIALOG_CAMERA_SAVE, { defaultName: 'view' },
    )
    expect(cm.invokeService).toHaveBeenCalledWith('saveCameraToFile', {
      sceneId: 1, name: '__current', path: '/tmp/view.cam',
    })
    h.unmount()
  })

  it('SaveCurrentView: cancelled save dialog does not write a file', async () => {
    const cm = makeCm({
      saveViewToCamera: () => ({ ok: true }),
      saveCameraToFile: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: true,
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.SaveCurrentView)

    expect(cm.invokeService).not.toHaveBeenCalledWith(
      'saveCameraToFile', expect.anything(),
    )
    h.unmount()
  })

  // ─── SceneReload ────────────────────────────────────────────────────────

  it('SceneReload: scene with no source file does not reload', async () => {
    const cm = makeCm({ getSceneSaveInfo: () => ({ ok: true, src: '' }) })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.SceneReload)

    expect(cm.invokeService).not.toHaveBeenCalledWith('loadScene', expect.anything())
    h.unmount()
  })

  it('SceneReload: unmodified scene reloads without a confirm dialog', async () => {
    const cm = makeCm(
      {
        getSceneSaveInfo: () => ({ ok: true, src: '/tmp/s.qsc' }),
        loadScene: () => ({ ok: true }),
      },
      { ok: true, modified: false, viewCount: 1, sceneName: 'S' },
    )
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.SceneReload)

    expect(showConfirmReload).not.toHaveBeenCalled()
    expect(cm.invokeService).toHaveBeenCalledWith('loadScene', {
      filePath: '/tmp/s.qsc', sceneId: 1,
    })
    h.unmount()
  })

  it('SceneReload: declined confirm on a modified scene aborts the reload', async () => {
    const cm = makeCm(
      {
        getSceneSaveInfo: () => ({ ok: true, src: '/tmp/s.qsc' }),
        loadScene: () => ({ ok: true }),
      },
      { ok: true, modified: true, viewCount: 1, sceneName: 'S' },
    )
    showConfirmReload.mockResolvedValue(false)
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.SceneReload)

    expect(showConfirmReload).toHaveBeenCalledWith({ sceneName: 'S' })
    expect(cm.invokeService).not.toHaveBeenCalledWith('loadScene', expect.anything())
    h.unmount()
  })

  // ─── ObjectSaveAs ───────────────────────────────────────────────────────

  it('ObjectSaveAs: empty scene does not enter the object-save flow', async () => {
    const cm = makeCm({
      getSceneTree: () => ({ ok: true, tree: { children: [] } }),
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ObjectSaveAs)

    expect(cm.invokeService).not.toHaveBeenCalledWith(
      'getObjectSaveInfo', expect.anything(),
    )
    h.unmount()
  })

  it('ObjectSaveAs: single object skips the picker and saves it directly', async () => {
    const cm = makeCm({
      getSceneTree: () => ({
        ok: true,
        tree: { children: [{ id: 10, name: 'mol', type: 'object', children: [] }] },
      }),
      // ok:false short-circuits runObjectSaveFlow before the native dialog.
      getObjectSaveInfo: () => ({ ok: false, filters: [] }),
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ObjectSaveAs)

    expect(showObjectPicker).not.toHaveBeenCalled()
    expect(cm.invokeService).toHaveBeenCalledWith('getObjectSaveInfo', {
      sceneId: 1, objId: 10,
    })
    h.unmount()
  })
})
