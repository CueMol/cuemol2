/**
 * Degrade-detection test for the OS-shell open wiring in main/index.ts.
 *
 * Strategy mirrors quitFunnel.test.ts: electron is mocked so the module-level
 * `app.on(...)` registrations land in a capture table, and the real
 * shellOpenQueue is used so what actually got queued can be asserted.
 *
 * The load-bearing case is the instance that loses the single-instance lock: it
 * must not create a window and must not run clearRenderHistory(), which wipes a
 * directory shared with the still-running instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Listener = (...args: unknown[]) => void

/** app.on(event, cb) listeners, keyed by event name. */
const appListeners = new Map<string, Listener[]>()

const appQuit = vi.fn()
const appFocus = vi.fn()
const requestSingleInstanceLock = vi.fn(() => true)
/** Captures the callback passed to app.whenReady().then(cb). */
let whenReadyCb: (() => void) | null = null

const app = {
  setName: vi.fn(),
  whenReady: vi.fn(() => ({
    then: vi.fn((cb: () => void) => {
      whenReadyCb = cb
    }),
  })),
  on: vi.fn((event: string, cb: Listener) => {
    const list = appListeners.get(event) ?? []
    list.push(cb)
    appListeners.set(event, list)
  }),
  quit: appQuit,
  focus: appFocus,
  requestSingleInstanceLock,
  getPath: vi.fn(() => '/tmp'),
  setPath: vi.fn(),
  isPackaged: false,
}

class BrowserWindow {
  static getAllWindows = vi.fn(() => [] as unknown[])
}

vi.mock('electron', () => ({
  app,
  BrowserWindow,
  nativeTheme: { themeSource: 'dark' },
  session: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
  },
}))

// main/index.ts imports these for startup side effects; stub them so the
// module loads under jsdom and so the calls can be asserted.
const createWindow = vi.fn()
const getMainWindow = vi.fn<() => unknown>(() => null)
const focusMainWindow = vi.fn()
vi.mock('../../main/windowManager', () => ({
  createWindow,
  getMainWindow,
  focusMainWindow,
}))

const clearRenderHistory = vi.fn()
vi.mock('../../main/renderHistory', () => ({ clearRenderHistory }))
vi.mock('../../main/movieOutput', () => ({ sweepMovieOutputs: vi.fn() }))
vi.mock('../../main/helpers/appIcon', () => ({ applyDevDockIcon: vi.fn() }))
vi.mock('../../main/stateStore', () => ({ loadUi: vi.fn(() => ({ theme: 'dark' })) }))
vi.mock('../../main/installMainCrashHandlers', () => ({
  installMainCrashHandlers: vi.fn(),
}))

// parseFileArgs stats each candidate path; treat them all as existing files.
// Mocked as a module because an ESM namespace cannot be spied on.
vi.mock('fs', () => ({
  default: { statSync: () => ({ isFile: () => true }), rmSync: () => undefined },
  statSync: () => ({ isFile: () => true }),
  rmSync: () => undefined,
}))
vi.mock('../../main/quitState', () => ({
  isAppQuitting: vi.fn(() => false),
  isForceQuit: vi.fn(() => false),
  setAppQuitting: vi.fn(),
}))

// String-variable dynamic import targets (dodge TS6307).
const indexEntry = '../../main/index'
const queueEntry = '../../main/shellOpenQueue'
const channelsEntry = '../../shared/ipcChannels'

interface QueueModule {
  takeShellOpen(): { paths: string[]; missing: string[] }
  resetShellOpenQueueForTests(): void
}

let queue: QueueModule
let IPC: Record<string, string>

/** Fake main window whose webContents.send calls are observable. */
function makeWin() {
  return { webContents: { send: vi.fn() } }
}

beforeEach(async () => {
  vi.resetModules()
  appListeners.clear()
  whenReadyCb = null
  appQuit.mockClear()
  appFocus.mockClear()
  createWindow.mockClear()
  focusMainWindow.mockClear()
  clearRenderHistory.mockClear()
  getMainWindow.mockReset()
  getMainWindow.mockReturnValue(null)
  requestSingleInstanceLock.mockReturnValue(true)
  app.isPackaged = false
  process.argv = ['electron', '.']

  queue = (await import(queueEntry)) as unknown as QueueModule
  queue.resetShellOpenQueueForTests()
  IPC = ((await import(channelsEntry)) as unknown as { IPC: Record<string, string> }).IPC
})

afterEach(() => {
  vi.restoreAllMocks()
})

function listener(event: string): Listener {
  const list = appListeners.get(event)
  if (!list || list.length === 0) throw new Error(`no listener registered for ${event}`)
  return list[0]
}

describe('shell open wiring (main/index.ts)', () => {
  it('queues command-line file arguments at startup', async () => {
    process.argv = ['electron', '.', '/data/1crn.pdb']

    await import(indexEntry)

    expect(queue.takeShellOpen().paths).toEqual(['/data/1crn.pdb'])
  })

  it("registers 'open-file' at module scope and preventDefaults it", async () => {
    await import(indexEntry)

    // Registered before whenReady resolves: macOS can deliver the event first.
    expect(whenReadyCb).not.toBeNull()
    expect(createWindow).not.toHaveBeenCalled()

    const event = { preventDefault: vi.fn() }
    listener('open-file')(event, '/data/2abc.pdb')

    // Without preventDefault Electron warns and drops the path.
    expect(event.preventDefault).toHaveBeenCalled()
    expect(queue.takeShellOpen().paths).toEqual(['/data/2abc.pdb'])
  })

  it('does not ping when no window exists yet', async () => {
    await import(indexEntry)

    const win = makeWin()
    getMainWindow.mockReturnValue(null)
    listener('open-file')({ preventDefault: vi.fn() }, '/data/2abc.pdb')

    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('pings the main window once when one exists', async () => {
    await import(indexEntry)

    const win = makeWin()
    getMainWindow.mockReturnValue(win)
    listener('open-file')({ preventDefault: vi.fn() }, '/data/2abc.pdb')

    // The ping carries no payload -- the renderer pulls the queue.
    expect(win.webContents.send).toHaveBeenCalledTimes(1)
    expect(win.webContents.send).toHaveBeenCalledWith(IPC.SHELL_FILES_PENDING)
  })

  it("'second-instance' focuses the existing window and queues its files", async () => {
    await import(indexEntry)
    const win = makeWin()
    getMainWindow.mockReturnValue(win)

    listener('second-instance')({}, ['electron', '.', 'rel/3xyz.pdb'], '/work')

    expect(focusMainWindow).toHaveBeenCalled()
    // UXP parity: open into the running window, never create a second one.
    expect(createWindow).not.toHaveBeenCalled()
    expect(queue.takeShellOpen().paths).toEqual(['/work/rel/3xyz.pdb'])
  })

  describe('when the single-instance lock is lost', () => {
    beforeEach(() => {
      requestSingleInstanceLock.mockReturnValue(false)
    })

    it('quits without creating a window', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      await import(indexEntry)

      expect(appQuit).toHaveBeenCalled()
      // app.quit() is async, so whenReady can still fire: it must bail out.
      expect(whenReadyCb).not.toBeNull()
      whenReadyCb!()
      expect(createWindow).not.toHaveBeenCalled()
    })

    it('does not clear the render history shared with the running instance', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      await import(indexEntry)

      // The history directory is a fixed path under os.tmpdir(); clearing it
      // here would destroy the running instance's images.
      listener('will-quit')()
      expect(clearRenderHistory).not.toHaveBeenCalled()
    })

    it('leaves the quit funnel alone', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      await import(indexEntry)

      const event = { preventDefault: vi.fn() }
      listener('before-quit')(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('queues nothing from its own command line', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined)
      process.argv = ['electron', '.', '/data/1crn.pdb']
      await import(indexEntry)

      // requestSingleInstanceLock already handed our argv to the primary.
      expect(queue.takeShellOpen().paths).toEqual([])
    })
  })

  it('clears the render history on quit when it owns the lock', async () => {
    await import(indexEntry)
    listener('will-quit')()
    expect(clearRenderHistory).toHaveBeenCalled()
  })
})
