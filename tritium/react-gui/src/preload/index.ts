/**
 * Electron preload script — bridges the sandboxed renderer process to the
 * privileged main process via IPC.
 *
 * All types are imported from `shared/ipcTypes` and all channel names from
 * `shared/ipcChannels` so there is a single source of truth for the contract.
 * The API is exposed on `window.electronAPI`.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  FileOpenedData,
  FileErrorData,
  FileDialogOptions,
  LayoutState,
  UiState,
  ElectronAPI,
} from '../shared/ipcTypes'
import { IPC } from '../shared/ipcChannels'

// ─────────────────────────────────────────────
// API implementation
// ─────────────────────────────────────────────

const api: ElectronAPI = {
  platform: process.platform,

  // App path info
  getAppPathInfo: () => ipcRenderer.invoke(IPC.APP_PATH),

  // File operations
  openFile: (options: FileDialogOptions) => ipcRenderer.invoke(IPC.DIALOG_OPEN, options),

  // Menu event listeners
  onFileOpened: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: FileOpenedData) => callback(data)
    ipcRenderer.on(IPC.FILE_OPENED, handler)
    return () => ipcRenderer.removeListener(IPC.FILE_OPENED, handler)
  },

  onFileError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: FileErrorData) => callback(data)
    ipcRenderer.on(IPC.FILE_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.FILE_ERROR, handler)
  },

  onMenuNewTab: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.MENU_NEW_TAB, handler)
    return () => ipcRenderer.removeListener(IPC.MENU_NEW_TAB, handler)
  },

  onMenuCloseTab: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.MENU_CLOSE_TAB, handler)
    return () => ipcRenderer.removeListener(IPC.MENU_CLOSE_TAB, handler)
  },

  onMenuSave: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.MENU_SAVE, handler)
    return () => ipcRenderer.removeListener(IPC.MENU_SAVE, handler)
  },

  onMenuNewScene: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.MENU_NEW_SCENE, handler)
    return () => ipcRenderer.removeListener(IPC.MENU_NEW_SCENE, handler)
  },

  onMenuOpenFile: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.MENU_OPEN_FILE, handler)
    return () => ipcRenderer.removeListener(IPC.MENU_OPEN_FILE, handler)
  },

  onMenuOpenScene: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.MENU_OPEN_SCENE, handler)
    return () => ipcRenderer.removeListener(IPC.MENU_OPEN_SCENE, handler)
  },

  // Layout persistence
  loadLayout: () => ipcRenderer.invoke(IPC.LAYOUT_LOAD),
  saveLayout: (state: LayoutState) => ipcRenderer.invoke(IPC.LAYOUT_SAVE, state),

  // UI preferences persistence
  loadUi: () => ipcRenderer.invoke(IPC.UI_LOAD),
  saveUi: (state: Partial<UiState>) => ipcRenderer.invoke(IPC.UI_SAVE, state),
}

contextBridge.exposeInMainWorld('electronAPI', api)
