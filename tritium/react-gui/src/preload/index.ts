/**
 * Electron preload script -- bridges the sandboxed renderer to the privileged
 * main process via IPC.
 *
 * The renderer-facing API is two generic helpers (`invoke` for renderer->main
 * request/reply and `onPush` for main->renderer notifications) backed by the
 * typed channel maps in `shared/ipcContract.ts`. There is no per-channel
 * method; every new channel is one entry in the map.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ElectronAPI,
  InvokeArgs,
  InvokeChannel,
  InvokeRes,
  PushCallback,
  PushChannel,
} from '@shared/ipcContract'

const api: ElectronAPI = {
  platform: process.platform,

  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeRes<C>> {
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeRes<C>>
  },

  onPush<C extends PushChannel>(channel: C, callback: PushCallback<C>): () => void {
    const handler = (_event: Electron.IpcRendererEvent, ...payload: unknown[]) => {
      ;(callback as (...a: unknown[]) => void)(...payload)
    }
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
