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
import { CommandProvider, useCommands } from '@renderer/commands/CommandRegistry'
import { CmdId } from '@renderer/commands/ids'
import { IPC } from '@shared/ipcChannels'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from '@renderer/__test__/helpers/testHarness'

// Dialog provider hooks are mocked so the test controls their resolved value.
const showObjectPicker = vi.fn<(args: unknown) => Promise<number | null>>()
const showConfirmReload = vi.fn<(args: unknown) => Promise<boolean>>()
const showExportPngOptions =
  vi.fn<(args: unknown) => Promise<{ width: number; height: number; alpha: boolean; dpi: number } | null>>()
const showErrorAlert = vi.fn<(args: unknown) => Promise<void>>()
vi.mock('@renderer/dialogs/ObjectPickerDialogProvider', () => ({
  useShowObjectPicker: () => showObjectPicker,
}))
vi.mock('@renderer/dialogs/ErrorAlertDialogProvider', () => ({
  useShowErrorAlert: () => showErrorAlert,
}))
vi.mock('@renderer/dialogs/ConfirmReloadSceneDialogProvider', () => ({
  useShowConfirmReloadSceneDialog: () => showConfirmReload,
}))
vi.mock('@renderer/dialogs/ExportPngOptionsDialogProvider', () => ({
  useShowExportPngOptionsDialog: () => showExportPngOptions,
}))

import { useFileCommands } from '@renderer/commands/useFileCommands'

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

  // --- Export scene (per-file-type commands) ---

  it('ExportPng: scene-name default, view-size-seeded options, then export', async () => {
    const cm = makeCm({
      getSceneExportInfo: () => ({ ok: true, sceneName: '1crn', width: 1600, height: 900 }),
      exportScene: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: '/tmp/1crn.png',
    })
    showExportPngOptions.mockResolvedValue({ width: 800, height: 450, alpha: true, dpi: 300 })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ExportPng)

    // default file name comes from the scene name; filter scoped to png
    expect(window.electronAPI.invoke).toHaveBeenCalledWith(IPC.DIALOG_SCENE_EXPORT, {
      defaultName: '1crn.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    })
    // image-type exporter -> options dialog seeded with the live view size
    expect(showExportPngOptions).toHaveBeenCalledWith({ initialWidth: 1600, initialHeight: 900 })
    // export uses the chosen size / alpha / dpi and the png exporter name
    expect(cm.invokeService).toHaveBeenCalledWith('exportScene', {
      sceneId: 1, viewId: 2, filePath: '/tmp/1crn.png', exporterName: 'png',
      width: 800, height: 450, alpha: true, resoln: 300, depth: false,
    })
    h.unmount()
  })

  it('ExportPov: geometry exporter skips the options dialog and uses view size', async () => {
    const cm = makeCm({
      getSceneExportInfo: () => ({ ok: true, sceneName: '1crn', width: 1600, height: 900 }),
      exportScene: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: '/tmp/1crn.pov',
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ExportPov)

    expect(window.electronAPI.invoke).toHaveBeenCalledWith(IPC.DIALOG_SCENE_EXPORT, {
      defaultName: '1crn.pov',
      filters: [{ name: 'POV-Ray SDL', extensions: ['pov'] }],
    })
    // no image-options dialog for geometry/SDL exporters
    expect(showExportPngOptions).not.toHaveBeenCalled()
    expect(cm.invokeService).toHaveBeenCalledWith('exportScene', {
      sceneId: 1, viewId: 2, filePath: '/tmp/1crn.pov', exporterName: 'pov',
      width: 1600, height: 900, alpha: false, resoln: undefined, depth: false,
    })
    h.unmount()
  })

  it('ExportPng: cancelling the options dialog does not export', async () => {
    const cm = makeCm({
      getSceneExportInfo: () => ({ ok: true, sceneName: 's', width: 1024, height: 768 }),
      exportScene: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: '/tmp/s.png',
    })
    showExportPngOptions.mockResolvedValue(null)
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ExportPng)

    expect(cm.invokeService).not.toHaveBeenCalledWith('exportScene', expect.anything())
    h.unmount()
  })

  it('ExportPng: cancelling the save dialog does not export', async () => {
    const cm = makeCm({
      getSceneExportInfo: () => ({ ok: true, sceneName: 's', width: 1024, height: 768 }),
      exportScene: () => ({ ok: true }),
    })
    ;(window.electronAPI.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: true,
      filePath: '',
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ExportPng)

    expect(showExportPngOptions).not.toHaveBeenCalled()
    expect(cm.invokeService).not.toHaveBeenCalledWith('exportScene', expect.anything())
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

  it('ObjectSaveAs: alerts and stops when no object is savable', async () => {
    // UXP `onFileSaveAs` alerts "No object to save" when its writer-filtered
    // list comes back empty.
    const cm = makeCm({
      listSavableObjects: () => ({ ok: true, objects: [] }),
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ObjectSaveAs)

    expect(showErrorAlert).toHaveBeenCalledWith({
      title: 'Save File As', message: 'No object to save',
    })
    expect(showObjectPicker).not.toHaveBeenCalled()
    expect(cm.invokeService).not.toHaveBeenCalledWith(
      'getObjectSaveInfo', expect.anything(),
    )
    h.unmount()
  })

  it('ObjectSaveAs: single object skips the picker and saves it directly', async () => {
    const cm = makeCm({
      listSavableObjects: () => ({
        ok: true,
        objects: [{ id: 10, name: 'mol', className: 'MolCoord' }],
      }),
      // ok:false short-circuits runObjectSaveFlow before the native dialog.
      getObjectSaveInfo: () => ({ ok: false, filters: [] }),
    })
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ObjectSaveAs)

    expect(showObjectPicker).not.toHaveBeenCalled()
    expect(cm.invokeService).toHaveBeenCalledWith('getObjectSaveInfo', {
      sceneId: 1, objId: 10, preferredWriter: 'pdb',
    })
    h.unmount()
  })

  it('ObjectSaveAs: picker rows carry the UXP "name (type, id=N)" label', async () => {
    const cm = makeCm({
      listSavableObjects: () => ({
        ok: true,
        objects: [
          { id: 10, name: 'mol', className: 'MolCoord' },
          { id: 11, name: 'map', className: 'DensityMap' },
        ],
      }),
    })
    showObjectPicker.mockResolvedValueOnce(null)
    const h = await mountWith(cm)

    await h.result.dispatch(CmdId.ObjectSaveAs)

    expect(showObjectPicker).toHaveBeenCalledWith({
      objects: [
        { id: 10, name: 'mol (MolCoord, id=10)' },
        { id: 11, name: 'map (DensityMap, id=11)' },
      ],
    })
    h.unmount()
  })
})
