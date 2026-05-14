/**
 * Degrade-detection test for the preload electronAPI surface.
 *
 * After B, the surface is a typed pair of generics: `invoke(channel, payload)`
 * and `onPush(channel, callback)` driven by the InvokeChannels / PushChannels
 * maps in `shared/ipcContract.ts`. The wire calls into `ipcRenderer` MUST
 * stay byte-for-byte identical to the pre-B per-channel methods so the main
 * side keeps working.
 *
 * This test pins:
 *   - `invoke(IPC.X, payload)` -> `ipcRenderer.invoke(IPC.X, payload)`
 *   - `onPush(IPC.X, cb)` -> `ipcRenderer.on(IPC.X, handler)` and unsubscribe
 *     calls `ipcRenderer.removeListener(IPC.X, handler)`
 *   - Push handler strips the IpcRendererEvent and forwards only the payload.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Handler = (...args: unknown[]) => void
// Minimal stand-in for Electron's IpcRendererEvent (we never read its fields).
type IpcRendererEventLike = Record<string, unknown>

const ipcRenderer = {
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
} as {
  invoke: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer,
}))

import { IPC } from '../../shared/ipcChannels'
import type { ElectronAPI } from '../../shared/ipcContract'

let api: ElectronAPI

beforeEach(async () => {
  vi.resetModules()
  exposeInMainWorld.mockReset()
  ipcRenderer.invoke.mockReset().mockResolvedValue(undefined)
  ipcRenderer.on.mockReset()
  ipcRenderer.removeListener.mockReset()

  // preload/index lives outside this tsconfig project (it belongs to
  // tsconfig.node.json). Vite/Vitest resolves it at runtime; a string
  // variable bypasses tsc's TS6307 cross-project check.
  const preloadEntry = '../../preload/index'
  await import(preloadEntry)
  expect(exposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object))
  api = exposeInMainWorld.mock.calls[0][1] as ElectronAPI
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('preload electronAPI -- shape', () => {
  it('exposes platform from process.platform', () => {
    expect(api.platform).toBe(process.platform)
  })
  it('exposes invoke and onPush as functions', () => {
    expect(typeof api.invoke).toBe('function')
    expect(typeof api.onPush).toBe('function')
  })
})

describe('preload electronAPI -- invoke routes through ipcRenderer.invoke', () => {
  it.each([
    [IPC.APP_PATH,         []],
    [IPC.DIALOG_OPEN,      [{ dialogType: 'open-obj', filters: [] }]],
    [IPC.LAYOUT_LOAD,      []],
    [IPC.LAYOUT_SAVE,      [{ mainSizes: [100, 200] }]],
    [IPC.UI_LOAD,          []],
    [IPC.UI_SAVE,          [{ theme: 'dark' }]],
    [IPC.MENU_UPDATE_STATE,[{ viewProjection: { enabled: true, perspective: true } }]],
    [IPC.MENU_INVOKE_ROLE, ['close']],
    [IPC.NAVI_CTX_SHOW,    [{ x: 1, y: 2, isSymm: false, atomLabel: '', rendLabel: '' }]],
  ])('invoke(%s) -> ipcRenderer.invoke(%s, ...args)', (channel, args) => {
    ;(api.invoke as (...a: unknown[]) => unknown)(channel, ...args)
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel, ...args)
  })

  it('invoke forwards the resolved value', async () => {
    ipcRenderer.invoke.mockResolvedValueOnce({ ok: true })
    const result = await (api.invoke as (...a: unknown[]) => Promise<unknown>)(IPC.LAYOUT_LOAD)
    expect(result).toEqual({ ok: true })
  })
})

describe('preload electronAPI -- onPush routes through ipcRenderer.on', () => {
  it.each([
    IPC.OBJ_FILE_OPENED,
    IPC.SCENE_FILE_OPENED,
    IPC.FILE_ERROR,
    IPC.MENU_NEW_TAB,
    IPC.MENU_CLOSE_TAB,
    IPC.MENU_SAVE,
    IPC.MENU_NEW_SCENE,
    IPC.MENU_OPEN_FILE,
    IPC.MENU_OPEN_SCENE,
    IPC.MENU_UNDO,
    IPC.MENU_REDO,
    IPC.MENU_GENERIC,
    IPC.ROTATE_GESTURE,
    IPC.MENU_OPEN_RECENT,
    IPC.RECENT_UPDATED,
  ])('onPush(%s) registers and unsubscribes', (channel) => {
    const cb = vi.fn()
    const unsubscribe = (api.onPush as (c: unknown, h: Handler) => () => void)(channel, cb)

    expect(ipcRenderer.on).toHaveBeenCalledWith(channel, expect.any(Function))
    const handler = ipcRenderer.on.mock.calls.at(-1)![1] as Handler

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, handler)
  })

  it('handler strips IpcRendererEvent and forwards single payload', () => {
    const cb = vi.fn()
    ;(api.onPush as (c: unknown, h: Handler) => () => void)(IPC.OBJ_FILE_OPENED, cb)
    const handler = ipcRenderer.on.mock.calls.at(-1)![1] as Handler
    const event: IpcRendererEventLike = {}
    const data = { name: 'foo', path: '/tmp/foo' }
    handler(event, data)
    expect(cb).toHaveBeenCalledWith(data)
  })

  it('handler forwards no payload for void channels', () => {
    const cb = vi.fn()
    ;(api.onPush as (c: unknown, h: Handler) => () => void)(IPC.MENU_NEW_TAB, cb)
    const handler = ipcRenderer.on.mock.calls.at(-1)![1] as Handler
    handler({} as IpcRendererEventLike)
    expect(cb).toHaveBeenCalledWith()
  })

  it('MENU_GENERIC handler forwards channel string', () => {
    const cb = vi.fn()
    ;(api.onPush as (c: unknown, h: Handler) => () => void)(IPC.MENU_GENERIC, cb)
    const handler = ipcRenderer.on.mock.calls.at(-1)![1] as Handler
    handler({} as IpcRendererEventLike, 'menu:about')
    expect(cb).toHaveBeenCalledWith('menu:about')
  })
})
