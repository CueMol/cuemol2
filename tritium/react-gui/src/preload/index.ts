/**
 * Electron preload script — bridges the sandboxed renderer process to the
 * privileged main process via IPC.
 *
 * All communication happens through typed channels so both sides share the
 * same contract. The API is exposed on `window.electronAPI`.
 */

import { contextBridge, ipcRenderer } from 'electron'

// ─────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────

export interface FileOpenedData {
  name: string
  path: string
  content: string
}

export interface FileErrorData {
  path: string
  error: string
}

/** Persisted splitter / panel state exchanged with the main process. */
export interface LayoutState {
  mainSizes?: number[]
  rightPanelSizes?: number[]
  centerSizes?: number[]
  sidebarOpen?: boolean
  inspectorOpen?: boolean
  explorerSizes?: number[]
  explorerCollapsed?: Record<string, boolean>
  selectionSizes?: number[]
  selectionCollapsed?: Record<string, boolean>
}

/** Miscellaneous UI preferences exchanged with the main process. */
export interface UiState {
  sidebarActiveView?: string
  selectionMolId?: string
  theme?: 'dark' | 'light'
}

export interface AppPathInfo {
  appPath: string
  exePath: string
  modulePath: string
  isPackaged: boolean
  sysConfigPath: string
}

export interface ElectronAPI {
  platform: string

  // ── App path info (for CueMol core init) ─────────────────
  getAppPathInfo: () => Promise<AppPathInfo>

  // ── File operations ───────────────────────────────────────
  openFile: () => Promise<void>

  // ── Menu event listeners ──────────────────────────────────
  onFileOpened: (callback: (data: FileOpenedData) => void) => () => void
  onFileError: (callback: (data: FileErrorData) => void) => () => void
  onMenuNewTab: (callback: () => void) => () => void
  onMenuCloseTab: (callback: () => void) => () => void
  onMenuSave: (callback: () => void) => () => void
  onMenuNewScene: (callback: () => void) => () => void

  // ── Layout persistence ────────────────────────────────────
  loadLayout: () => Promise<LayoutState>
  saveLayout: (state: LayoutState) => Promise<void>

  // ── UI preferences persistence ────────────────────────────
  loadUi: () => Promise<UiState>
  saveUi: (state: Partial<UiState>) => Promise<void>
}

// ─────────────────────────────────────────────
// API implementation
// ─────────────────────────────────────────────

const api: ElectronAPI = {
  platform: process.platform,

  // App path info
  getAppPathInfo: () => ipcRenderer.invoke('apppath'),

  // File operations
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  // Menu event listeners
  onFileOpened: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: FileOpenedData) => callback(data)
    ipcRenderer.on('file:opened', handler)
    return () => ipcRenderer.removeListener('file:opened', handler)
  },

  onFileError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: FileErrorData) => callback(data)
    ipcRenderer.on('file:error', handler)
    return () => ipcRenderer.removeListener('file:error', handler)
  },

  onMenuNewTab: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu:new-tab', handler)
    return () => ipcRenderer.removeListener('menu:new-tab', handler)
  },

  onMenuCloseTab: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu:close-tab', handler)
    return () => ipcRenderer.removeListener('menu:close-tab', handler)
  },

  onMenuSave: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu:save', handler)
    return () => ipcRenderer.removeListener('menu:save', handler)
  },

  onMenuNewScene: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu:new-scene', handler)
    return () => ipcRenderer.removeListener('menu:new-scene', handler)
  },

  // Layout persistence
  loadLayout: () => ipcRenderer.invoke('layout:load'),
  saveLayout: (state) => ipcRenderer.invoke('layout:save', state),

  // UI preferences persistence
  loadUi: () => ipcRenderer.invoke('ui:load'),
  saveUi: (state) => ipcRenderer.invoke('ui:save', state),
}

contextBridge.exposeInMainWorld('electronAPI', api)
