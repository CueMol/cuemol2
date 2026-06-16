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
const showExportPngOptions =
  vi.fn<(args: unknown) => Promise<{ width: number; height: number; alpha: boolean; dpi: number } | null>>()
vi.mock('../components/dialogs/ObjectPickerDialogProvider', () => ({
  useShowObjectPicker: () => showObjectPicker,
}))
vi.mock('../components/dialogs/ConfirmReloadSceneDialogProvider', () => ({
  useShowConfirmReloadSceneDialog: () => showConfirmReload,
}))
vi.mock('../components/dialogs/ExportPngOptionsDialogProvider', () => ({
  useShowExportPngOptionsDialog: () => showExportPngOptions,
}))

import { useFileCommands } from '../commands/useFileCommands'

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(CommandProvider, null, children)

type Routes = Record<string, (args: unknown) => unknown>

function makeCm(routes: Routes, closeInfo?: unknown) {
  // After the apis/* facade collapse, `getSceneCloseInfo` is reached via
  // `cm.invokeService('getSceneCloseInfo', { viewId })`. Route it through
  // the same invokeService spy, falling back to the `closeInfo` fixture.
  const invokeService = vi.fn((name: string, args: unknown) => {
    if (routes[name]) return Promise.resolve(routes[name](args))
    if (name === 'getSceneCloseInfo') return Promise.resolve(closeInfo)
    return Promise.resolve(undefined)
  })
  return { invokeService }
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
    showExportPngOptions.mockReset()
    // Default: user accepts the PNG options with a concrete pixel size.
    showExportPngOptions.mockResolvedValue({ width: 1024, height: 768, alpha: false, dpi: 150 })
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })
  afterEach(() => {
    teardownElectronAPI()
    warnSpy.mockRestore()
    infoSpy.mockRestore()
  })

  // --- SaveCurrentView ---

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

  // --- ExportImage ---

  it('ExportImage: scene-name default, view-size-seeded options, then export', async () => {
    const cm = makeCm({
      getExportImageInfo: () => ({ ok: true, sceneName: '1crn', width: 1600, height: 900 }),
      exportImage: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: '/tmp/1crn.png',
    })
    showExportPngOptions.mockResolvedValue({ width: 800, height: 450, alpha: true, dpi: 300 })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ExportImage)

    // default file name comes from the scene name
    expect(window.electronAPI.invoke).toHaveBeenCalledWith(
      IPC.DIALOG_IMAGE_SAVE, { defaultName: '1crn.png' },
    )
    // options dialog seeded with the live view size
    expect(showExportPngOptions).toHaveBeenCalledWith({ initialWidth: 1600, initialHeight: 900 })
    // export uses the chosen size / alpha / dpi
    expect(cm.invokeService).toHaveBeenCalledWith('exportImage', {
      sceneId: 1, viewId: 2, filePath: '/tmp/1crn.png',
      width: 800, height: 450, alpha: true, resoln: 300, depth: false,
    })
    h.unmount()
  })

  it('ExportImage: cancelling the options dialog does not export', async () => {
    const cm = makeCm({
      getExportImageInfo: () => ({ ok: true, sceneName: 's', width: 1024, height: 768 }),
      exportImage: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: '/tmp/s.png',
    })
    showExportPngOptions.mockResolvedValue(null)
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ExportImage)

    expect(cm.invokeService).not.toHaveBeenCalledWith('exportImage', expect.anything())
    h.unmount()
  })

  // --- SceneReload ---

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

  // --- ObjectSaveAs ---

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
