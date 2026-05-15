/**
 * @file main/handlers/fileDialogs.ts
 * @description Native file-dialog prompt helpers for the Electron main
 * process. Each opens an Electron save/open dialog (wrapped in
 * `withMenuBlocked('native', ...)` so the app menu is inert while the OS
 * dialog is up) and returns the resolved `{ canceled, filePath }`.
 *
 * Extracted from `ipcHandlers.ts`, which keeps the IPC registration and
 * the non-dialog handlers (file-open flow, file-exists / backup-rename,
 * menu / recent-files wiring).
 */

import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import path from 'path'
import { withMenuBlocked } from '../menu'

export async function handleSaveSceneDialog(
  mainWindow: BrowserWindow,
  defaultName: string,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Scene As',
      defaultPath: defaultName,
      filters: [
        { name: 'CueMol Scene', extensions: ['qsc'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  return {
    canceled: result.canceled,
    filePath: result.filePath ?? '',
  }
}

// UXP uses `fp.appendFilter("Style file (*.xml)", "*.xml")` on the
// nsIFilePicker for both load and save. The worker side performs the
// actual `StyleManager.loadStyleSetFromFile` / `saveStyleSetToFile` call
// once we return the resolved path.

export async function handleStyleOpenDialog(
  mainWindow: BrowserWindow,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showOpenDialog(mainWindow, {
      title: 'Open Style File',
      filters: [
        { name: 'Style file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    }),
  )
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: '' }
  }
  return { canceled: false, filePath: result.filePaths[0] }
}

export async function handleStyleSaveDialog(
  mainWindow: BrowserWindow,
  defaultName: string,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Style As',
      defaultPath: defaultName,
      filters: [
        { name: 'Style file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  return {
    canceled: result.canceled,
    filePath: result.filePath ?? '',
  }
}

// UXP uses an unfiltered nsIFilePicker for camera files (the on-disk
// format is XML). We add the same .xml + All Files pair so the dialog
// is consistent with the style-file picker.

export async function handleCameraOpenDialog(
  mainWindow: BrowserWindow,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showOpenDialog(mainWindow, {
      title: 'Open Camera File',
      filters: [
        { name: 'Camera file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    }),
  )
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: '' }
  }
  return { canceled: false, filePath: result.filePaths[0] }
}

export async function handleCameraSaveDialog(
  mainWindow: BrowserWindow,
  defaultName: string,
): Promise<{ canceled: boolean; filePath: string }> {
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Camera As',
      defaultPath: defaultName,
      filters: [
        { name: 'Camera file', extensions: ['xml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  return {
    canceled: result.canceled,
    filePath: result.filePath ?? '',
  }
}

// The filter list is built worker-side from
// `StreamManager.findCompatibleWriterNamesForObj` × the writer category
// of `StreamManager.getInfoJSON2`; the renderer forwards it here. We
// surface the selected filter index back to the caller so the worker can
// pass the matching writer name to `createHandler`.

export async function handleObjectSaveDialog(
  mainWindow: BrowserWindow,
  payload: {
    defaultDir: string
    defaultName: string
    filters: { name: string; extensions: string[] }[]
    defaultFilterIndex?: number
  },
): Promise<{ canceled: boolean; filePath: string; filterIndex: number }> {
  const defaultPath = payload.defaultDir
    ? path.join(payload.defaultDir, payload.defaultName)
    : payload.defaultName
  const result = await withMenuBlocked('native', () =>
    dialog.showSaveDialog(mainWindow, {
      title: 'Save Object As',
      defaultPath,
      filters: [
        ...payload.filters,
        { name: 'All Files', extensions: ['*'] },
      ],
    }),
  )
  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: '', filterIndex: -1 }
  }
  // Electron does not return the chosen filter index. Best-effort recover
  // it from the file extension. Falls back to defaultFilterIndex (or 0)
  // when no match — the worker will use that writer name.
  const ext = (result.filePath.split('.').pop() ?? '').toLowerCase()
  let filterIndex = payload.defaultFilterIndex ?? 0
  for (let i = 0; i < payload.filters.length; i++) {
    if (payload.filters[i].extensions.some((e) => e.toLowerCase() === ext)) {
      filterIndex = i
      break
    }
  }
  return { canceled: false, filePath: result.filePath, filterIndex }
}
