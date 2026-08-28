/**
 * Degrade-detection test for the MAIN-process quit/close funnel.
 *
 * The renderer half of window-close (walk tabs -> WINDOW_CLOSE_PROCEED) is
 * already pinned by windowCloseFlow.test.tsx, and the per-window state
 * primitives by quitState.test.ts. This file pins the remaining, currently
 * untested MAIN-side branch logic that a future consolidation could regress:
 *
 *   - main/index.ts        before-quit guard (route-through vs short-circuit)
 *   - main/ipcHandlers.ts  WINDOW_CLOSE_PROCEED (proceed true/false) + FORCE_QUIT
 *   - main/windowManager.ts handleWindowClose funnel (confirm gate, in-flight
 *                           re-entrancy, watchdog) + render-process-gone teardown
 *
 * Strategy: electron is mocked so the module-level `app.on(...)` registrations
 * and `ipcMain.handle(...)` handlers land in capture tables; the REAL
 * quitState module is used so the cross-module flag handshake (the actual
 * observable contract) is exercised end to end. Assertions pin call order and
 * which electron `app` / `win` methods fire -- not internals.
 *
 * Each test is load-bearing: removing or reordering the corresponding branch
 * (e.g. dropping the isForceQuit short-circuit, or the in-flight guard) flips
 * an asserted call count / order and fails the test.
 *
 * main/* lives in the tsconfig.node project; a string-variable dynamic import
 * keeps tsc's TS6307 cross-project check off this file (same trick as
 * quitState.test.ts / preloadElectronApi.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IPC } from '@shared/ipcChannels'

// --- electron mock with capture tables ---

type Listener = (...args: unknown[]) => void
type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown

/** app.on(event, cb) listeners, keyed by event name. */
const appListeners = new Map<string, Listener[]>()
/** ipcMain.handle(channel, handler) handlers, keyed by channel. */
const ipcHandlers = new Map<string, InvokeHandler>()

const appQuit = vi.fn()
const appExit = vi.fn()

const app = {
  setName: vi.fn(),
  whenReady: vi.fn(() => ({ then: vi.fn() })),
  on: vi.fn((event: string, cb: Listener) => {
    const list = appListeners.get(event) ?? []
    list.push(cb)
    appListeners.set(event, list)
  }),
  quit: appQuit,
  exit: appExit,
  getPath: vi.fn(() => '/tmp'),
  isPackaged: false,
  // main/index.ts takes the single-instance lock at module scope; grant it so
  // the rest of its module body (including the before-quit registration under
  // test) runs. The losing-instance behaviour is covered by
  // shellOpenLifecycle.test.ts.
  requestSingleInstanceLock: vi.fn(() => true),
  focus: vi.fn(),
}

const ipcMain = {
  handle: vi.fn((channel: string, handler: InvokeHandler) => {
    ipcHandlers.set(channel, handler)
  }),
}

// A fake event whose preventDefault we can observe.
function makeEvent(): { preventDefault: ReturnType<typeof vi.fn> } {
  return { preventDefault: vi.fn() }
}

// Windows registered on the BrowserWindow capture list (for before-quit).
let allWindows: FakeWindow[] = []

/** Fake webContents collecting its event listeners by name. */
interface FakeWebContents {
  send: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  openDevTools: ReturnType<typeof vi.fn>
  listeners: Map<string, Listener[]>
}

interface FakeWindow {
  close: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  webContents: FakeWebContents
  on?: ReturnType<typeof vi.fn>
  listeners?: Map<string, Listener[]>
}

function makeWebContents(): FakeWebContents {
  const listeners = new Map<string, Listener[]>()
  return {
    send: vi.fn(),
    openDevTools: vi.fn(),
    on: vi.fn((event: string, cb: Listener) => {
      const l = listeners.get(event) ?? []
      l.push(cb)
      listeners.set(event, l)
    }),
    listeners,
  }
}

function makeWin(destroyed = false): FakeWindow {
  return {
    close: vi.fn(),
    isDestroyed: vi.fn(() => destroyed),
    webContents: makeWebContents(),
  }
}

// The next BrowserWindow() constructed by createWindow() is captured here so
// tests can fire its window/webContents listeners.
let constructedWin: FakeWindow | null = null

// Read constructedWin without tsc carrying the `= null` literal narrowing past
// the opaque createWindow() side effect (which reassigns it via the ctor).
const getConstructedWin = (): FakeWindow | null => constructedWin

// Constructable BrowserWindow with static getAllWindows -- createWindow() does
// `new BrowserWindow(...)`, index.ts uses `BrowserWindow.getAllWindows()`.
class BrowserWindow {
  close = vi.fn()
  isDestroyed = vi.fn(() => false)
  webContents = makeWebContents()
  listeners = new Map<string, Listener[]>()
  maximize = vi.fn()
  show = vi.fn()
  focus = vi.fn()
  setMenuBarVisibility = vi.fn()
  setFullScreen = vi.fn()
  isFullScreen = vi.fn(() => false)
  loadURL = vi.fn()
  loadFile = vi.fn()
  on = vi.fn((event: string, cb: Listener) => {
    const l = this.listeners.get(event) ?? []
    l.push(cb)
    this.listeners.set(event, l)
  })
  constructor() {
    constructedWin = this as unknown as FakeWindow
  }
  static getAllWindows = vi.fn(() => allWindows)
}

vi.mock('electron', () => ({
  app,
  BrowserWindow,
  // ipcHandlers.ts also imports `dialog`; provide a stub so the module loads.
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  ipcMain,
  // windowManager.ts reads screen.getAllDisplays() for bounds visibility.
  screen: { getAllDisplays: vi.fn(() => []) },
}))

// ipcHandlers.ts pulls in several heavy main-process modules at import time.
// Stub the ones unrelated to the close funnel so the module loads under jsdom.
vi.mock('@main/stateStore', () => ({
  loadLayout: vi.fn(),
  saveLayout: vi.fn(),
  loadUi: vi.fn(),
  saveUi: vi.fn(),
  loadWindowBounds: vi.fn(() => null),
  saveWindowBounds: vi.fn(),
}))
vi.mock('@main/menu', () => ({
  rebuildApplicationMenu: vi.fn(),
  setMenuBlocked: vi.fn(),
  updateMenuState: vi.fn(),
  withMenuBlocked: vi.fn((_m: unknown, fn: () => unknown) => fn()),
  createMenu: vi.fn(),
}))
vi.mock('@main/textContextMenu', () => ({ registerTextContextMenu: vi.fn() }))
vi.mock('@main/recentFiles', () => ({
  addRecent: vi.fn(() => []),
  clearRecents: vi.fn(() => []),
  getRecents: vi.fn(() => []),
  refreshRecentsExistence: vi.fn(() => Promise.resolve()),
}))
vi.mock('@main/naviContextMenu', () => ({ showNaviContextMenu: vi.fn() }))
vi.mock('@main/sceneContextMenu', () => ({ showSceneContextMenu: vi.fn() }))
vi.mock('@main/handlers/fileDialogs', () => ({
  handleSaveSceneDialog: vi.fn(),
  handleStyleOpenDialog: vi.fn(),
  handleStyleSaveDialog: vi.fn(),
  handleCameraOpenDialog: vi.fn(),
  handleCameraSaveDialog: vi.fn(),
  handleSceneExportDialog: vi.fn(),
  handleObjectSaveDialog: vi.fn(),
  handlePickPathDialog: vi.fn(),
  handleSaveTextAsDialog: vi.fn(),
}))
vi.mock('@main/helpers/inferContentFirst', () => ({ inferContentFirst: vi.fn(() => false) }))

// String-variable dynamic import targets (dodge TS6307).
const indexEntry = '@main/index'
const ipcHandlersEntry = '@main/ipcHandlers'
const windowManagerEntry = '@main/windowManager'
const quitStateEntry = '@main/quitState'

interface IpcHandlersModule {
  registerIpcHandlers(win: unknown): void
}
interface QuitStateModule {
  isAppQuitting(): boolean
  setAppQuitting(v: boolean): void
  isForceQuit(): boolean
  setForceQuit(v: boolean): void
  isCloseConfirmed(win: object): boolean
  setCloseConfirmed(win: object, v: boolean): void
  isCloseInFlight(win: object): boolean
}

let quitState: QuitStateModule

beforeEach(async () => {
  vi.resetModules()
  appListeners.clear()
  ipcHandlers.clear()
  allWindows = []
  appQuit.mockClear()
  appExit.mockClear()
  app.on.mockClear()
  ipcMain.handle.mockClear()

  // Real quitState (fresh instance: WeakMap + flags reset).
  quitState = (await import(quitStateEntry)) as unknown as QuitStateModule
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Fire the captured before-quit listener registered by main/index.ts. */
async function importIndexAndGetBeforeQuit(): Promise<Listener> {
  await import(indexEntry)
  const list = appListeners.get('before-quit')
  if (!list || list.length === 0) throw new Error('before-quit listener not registered')
  return list[0]
}

describe('before-quit guard (main/index.ts)', () => {
  /**
   * Only the main window is closed. It is the one with a confirm funnel, and
   * its 'closed' handler takes the Rendering window down with it. Closing every
   * window here destroyed the Rendering window first -- it has no funnel -- so
   * cancelling the main window's save prompt restored the app minus its render
   * history view and any in-flight settings.
   */
  it('routes a fresh quit through the main window only, and sets appQuitting', async () => {
    const beforeQuit = await importIndexAndGetBeforeQuit()
    constructedWin = null
    const wm = (await import(windowManagerEntry)) as unknown as { createWindow(): void }
    wm.createWindow()
    const mainWin = getConstructedWin()
    if (!mainWin) throw new Error('createWindow did not construct a BrowserWindow')

    // A second live window (the Rendering window) must be left alone.
    const other = makeWin()
    allWindows = [mainWin, other]

    const ev = makeEvent()
    beforeQuit(ev)

    expect(ev.preventDefault).toHaveBeenCalledTimes(1)
    expect(mainWin.close).toHaveBeenCalledTimes(1)
    expect(other.close).not.toHaveBeenCalled()
    expect(quitState.isAppQuitting()).toBe(true)
  })

  it('short-circuits (no preventDefault, no close) when forceQuit is set', async () => {
    const beforeQuit = await importIndexAndGetBeforeQuit()
    const win = makeWin()
    allWindows = [win]
    quitState.setForceQuit(true)

    const ev = makeEvent()
    beforeQuit(ev)

    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(win.close).not.toHaveBeenCalled()
  })

  it('lets the re-entrant quit proceed once appQuitting is already set', async () => {
    const beforeQuit = await importIndexAndGetBeforeQuit()
    const win = makeWin()
    allWindows = [win]
    quitState.setAppQuitting(true)

    const ev = makeEvent()
    beforeQuit(ev)

    // The second pass must NOT re-prevent or re-close -- shutdown proceeds.
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(win.close).not.toHaveBeenCalled()
  })

  it('does nothing when there are no live windows (destroyed are filtered out)', async () => {
    const beforeQuit = await importIndexAndGetBeforeQuit()
    allWindows = [makeWin(true)]

    const ev = makeEvent()
    beforeQuit(ev)

    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(quitState.isAppQuitting()).toBe(false)
  })
})

describe('WINDOW_CLOSE_PROCEED + FORCE_QUIT handlers (main/ipcHandlers.ts)', () => {
  async function register(win: FakeWindow): Promise<void> {
    const mod = (await import(ipcHandlersEntry)) as unknown as IpcHandlersModule
    mod.registerIpcHandlers(win)
  }

  it('proceed:true marks the window confirmed and re-issues close()', async () => {
    const win = makeWin()
    await register(win)
    const handler = ipcHandlers.get(IPC.WINDOW_CLOSE_PROCEED)!
    expect(handler).toBeDefined()

    expect(quitState.isCloseConfirmed(win as object)).toBe(false)
    handler({}, { proceed: true })

    expect(quitState.isCloseConfirmed(win as object)).toBe(true)
    expect(quitState.isCloseInFlight(win as object)).toBe(false)
    expect(win.close).toHaveBeenCalledTimes(1)
  })

  it('proceed:false clears in-flight, aborts the quit (appQuitting reset), does NOT close', async () => {
    const win = makeWin()
    await register(win)
    quitState.setAppQuitting(true)
    const handler = ipcHandlers.get(IPC.WINDOW_CLOSE_PROCEED)!

    handler({}, { proceed: false })

    expect(quitState.isCloseConfirmed(win as object)).toBe(false)
    expect(quitState.isCloseInFlight(win as object)).toBe(false)
    expect(quitState.isAppQuitting()).toBe(false)
    expect(win.close).not.toHaveBeenCalled()
  })

  it('FORCE_QUIT bypasses the funnel: sets force/quit flags, confirms the window, app.exit(0)', async () => {
    const win = makeWin()
    await register(win)
    const handler = ipcHandlers.get(IPC.FORCE_QUIT)!
    expect(handler).toBeDefined()

    handler({})

    expect(quitState.isForceQuit()).toBe(true)
    expect(quitState.isAppQuitting()).toBe(true)
    expect(quitState.isCloseConfirmed(win as object)).toBe(true)
    expect(appExit).toHaveBeenCalledWith(0)
  })
})

describe('handleWindowClose funnel + render-process-gone (main/windowManager.ts)', () => {
  interface WindowManagerModule {
    createWindow(): void
  }

  /** Build a window via createWindow() and return its captured listeners. */
  async function buildWindow(): Promise<{
    win: FakeWindow
    fireClose: (ev: { preventDefault: ReturnType<typeof vi.fn> }) => void
    fireRenderGone: () => void
  }> {
    constructedWin = null
    const mod = (await import(windowManagerEntry)) as unknown as WindowManagerModule
    mod.createWindow()
    // createWindow() reassigns constructedWin through the BrowserWindow ctor,
    // a side effect tsc cannot see; read through a getter so flow analysis does
    // not narrow the post-assignment value to never via the earlier `= null`.
    const win = getConstructedWin()
    if (!win) throw new Error('createWindow did not construct a BrowserWindow')
    // Two 'close' listeners are attached (bounds-save + confirm funnel); the
    // confirm funnel is the last one registered.
    const closeListeners = win.listeners!.get('close') ?? []
    const closeFunnel = closeListeners[closeListeners.length - 1]
    const goneListeners = win.webContents.listeners.get('render-process-gone') ?? []
    return {
      win,
      fireClose: (ev) => closeFunnel(ev),
      fireRenderGone: () => goneListeners[0]?.({}, { reason: 'crashed', exitCode: 1 }),
    }
  }

  it('first close: preventDefault, send WINDOW_CLOSE_REQUEST, set in-flight', async () => {
    const { win, fireClose } = await buildWindow()
    const ev = makeEvent()
    fireClose(ev)

    expect(ev.preventDefault).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.WINDOW_CLOSE_REQUEST)
    expect(quitState.isCloseInFlight(win as object)).toBe(true)
  })

  it('re-entrant close while in-flight is ignored (no duplicate WINDOW_CLOSE_REQUEST)', async () => {
    const { win, fireClose } = await buildWindow()
    fireClose(makeEvent())
    win.webContents.send.mockClear()

    // Second close arrives before the renderer replied.
    const ev2 = makeEvent()
    fireClose(ev2)

    // Still prevented, but no second request is dispatched.
    expect(ev2.preventDefault).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('confirmed close passes through: no preventDefault, no request', async () => {
    const { win, fireClose } = await buildWindow()
    quitState.setCloseConfirmed(win as object, true)

    const ev = makeEvent()
    fireClose(ev)

    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalledWith(IPC.WINDOW_CLOSE_REQUEST)
  })

  it('render-process-gone funnels into force teardown: confirm + force + appQuitting + app.exit(1)', async () => {
    const { win, fireRenderGone } = await buildWindow()
    fireRenderGone()

    expect(quitState.isCloseConfirmed(win as object)).toBe(true)
    expect(quitState.isForceQuit()).toBe(true)
    expect(quitState.isAppQuitting()).toBe(true)
    expect(appExit).toHaveBeenCalledWith(1)
  })
})
