/**
 * @file main/updater/index.ts
 * @description The app's self-update: @cuemol/updater wired to Electron.
 *
 * Runs only in a packaged macOS arm64 or Windows x64 build (the OSes with
 * an installer: MacInstaller swaps the bundle, WinInstaller runs Setup.exe
 * elevated). Main owns the flow and pushes the whole status to the main window
 * on every change (`IPC.UPDATE_STATUS`); the window shows it as notifications
 * and dialogs and sends the user's choices back over the `UPDATE_*` invoke
 * channels.
 *
 * Lifecycle:
 *   - `noteMainWindowRevealed` (the renderer's reveal signal) tells a waiting
 *     swap helper that this version started, and schedules the startup check
 *     unless Settings turned it off (`UiState.updateCheck`).
 *   - `UPDATE_RESTART` quits through the normal save prompts (`quitApp`);
 *     'will-quit' then starts the swap helper (`swapOnQuit`).
 *   - The next start reports the helper's outcome (`lastResult`).
 *
 * `CUEMOL_UPDATE_FEED` replaces the GitHub releases URL, for trying the flow
 * against a local server.
 */

import { app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  DEFAULT_FEED_URL,
  MacInstaller,
  UpdateController,
  WinInstaller,
  handoverInProgress,
  markLaunched,
  parseVersion,
  takeSwapResult,
  type Installer,
  type UpdatePlatform,
  type UpdateStatus as ControllerStatus,
} from '@cuemol/updater'
import { IPC } from '@shared/ipcChannels'
import type { UpdateStatus, UpdateSwapResult } from '@shared/types/update'
import { handleInvoke } from '../ipc/handleInvoke'
import { getMainWindow } from '../windows/mainWindow'
import { quitApp } from '../appQuit'
import { loadUi } from '../stateStore'

/** Delay between the main window appearing and the startup check. */
const STARTUP_CHECK_DELAY_MS = 10_000

/** How often, and how many times, to look for the helper's outcome after the launch marker. */
const RESULT_POLL_MS = 250
const RESULT_POLL_TRIES = 40

const RELEASES_PAGE = 'https://github.com/CueMol/cuemol2/releases/latest'

/**
 * How long after a handover the start-up cleanup leaves the work directory
 * alone: longer than any helper waits (Windows: install + launch + confirm).
 */
const HANDOVER_MAX_AGE_MS = 30 * 60_000

let controller: UpdateController | null = null
let installer: (Installer & { cleanup(): void }) | null = null
let workDir = ''
let current = ''
let lastResult: UpdateSwapResult | null = null
/** Whether the check in flight (or last finished) came from the menu. */
let manualCheck = false
let startupCheckScheduled = false

/** The work directory under userData, shared by the old and the new app. */
function updaterDir(): string {
  return path.join(app.getPath('userData'), 'updater')
}

/** The full four-part version package.sh stamps into the packaged package.json. */
function readFullVersion(): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'))
    return typeof pkg.cuemolVersion === 'string' && parseVersion(pkg.cuemolVersion) ? pkg.cuemolVersion : null
  } catch {
    return null
  }
}

/** A version the updater already failed to start; not offered again by the startup check. */
function rolledBackFile(): string {
  return path.join(workDir, 'rolled-back')
}

function readRolledBack(): string | null {
  try {
    return fs.readFileSync(rolledBackFile(), 'utf8').trim() || null
  } catch {
    return null
  }
}

/**
 * The status as the window should see it. A startup check stays silent
 * unless it finds something to offer: its errors (offline) and a version that
 * already failed to start are shown as idle.
 */
function present(s: ControllerStatus): UpdateStatus {
  let state = s.state
  if (!manualCheck) {
    if (state.phase === 'error' && !state.release) state = { phase: 'idle' }
    if (state.phase === 'available' && state.release.version === readRolledBack()) state = { phase: 'idle' }
  }
  return { supported: true, ...s, state, lastResult }
}

/** The status now, for the window's first read. */
export function getUpdateStatus(): UpdateStatus {
  if (!controller) {
    return { supported: false, current: current || app.getVersion(), canInstall: false, state: { phase: 'idle' } }
  }
  return present(controller.status())
}

function push(): void {
  getMainWindow()?.webContents.send(IPC.UPDATE_STATUS, getUpdateStatus())
}

/** The installer target of this build, or null where there is none. */
function updatePlatform(): UpdatePlatform | null {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'darwin-arm64'
  if (process.platform === 'win32' && process.arch === 'x64') return 'win32-x64'
  return null
}

/**
 * Set the updater up. Call once, after the main window exists; does nothing
 * outside a packaged macOS arm64 or Windows x64 build.
 */
export function initUpdater(): void {
  const platform = updatePlatform()
  if (!app.isPackaged || !platform) return
  const version = readFullVersion()
  if (!version) {
    console.warn('[Updater] no cuemolVersion in package.json; updates disabled')
    return
  }
  current = version
  workDir = updaterDir()
  fs.mkdirSync(workDir, { recursive: true })

  const result = takeSwapResult(workDir)
  if (result) {
    lastResult = result
    console.log(`[Updater] last update: ${result.outcome} ${result.from} -> ${result.to} ${result.detail}`)
    if (result.outcome === 'rolledBack') fs.writeFileSync(rolledBackFile(), result.to)
  }

  const opts = { execPath: process.execPath, workDir, pid: process.pid }
  installer =
    platform === 'win32-x64'
      ? new WinInstaller({ ...opts, launcherPath: path.join(process.resourcesPath, 'CueMol3 Updater.exe') })
      : new MacInstaller(opts)
  // Whatever an earlier update left behind (download, staging, backup) is
  // stale now -- unless this is the version a helper just launched: the
  // helper still needs the backup (and its signal files) until it hears
  // from this start.
  if (!handoverInProgress(workDir, HANDOVER_MAX_AGE_MS)) installer.cleanup()

  controller = new UpdateController({
    current: parseVersion(version)!,
    platform,
    feedUrl: process.env.CUEMOL_UPDATE_FEED || DEFAULT_FEED_URL,
    fetchFn: fetch,
    workDir,
    installer,
    onStatus: () => push(),
  })
  console.log(`[Updater] ready (version ${version}, can install: ${installer.canInstall().ok})`)
}

/**
 * The main window is up. `byFallback` means the renderer never signalled,
 * which does not count as a successful start.
 */
export function noteMainWindowRevealed(byFallback: boolean): void {
  if (!controller || byFallback) return
  if (markLaunched(workDir, current)) {
    console.log(`[Updater] reported a successful start of ${current}`)
    awaitSwapResult()
  }
  if (startupCheckScheduled) return
  startupCheckScheduled = true
  if (loadUi().updateCheck === false) return
  setTimeout(() => {
    if (loadUi().updateCheck === false) return
    manualCheck = false
    void controller?.check(false)
  }, STARTUP_CHECK_DELAY_MS)
}

/**
 * Pick up the helper's outcome once it has seen the launch marker. It writes
 * the result only after this app has started, so the read at startup
 * (initUpdater) came too early for the run that the update launched.
 */
function awaitSwapResult(): void {
  let tries = 0
  const timer = setInterval(() => {
    const result = takeSwapResult(workDir)
    if (result || ++tries >= RESULT_POLL_TRIES) clearInterval(timer)
    if (!result) return
    lastResult = result
    console.log(`[Updater] update finished: ${result.outcome} ${result.from} -> ${result.to}`)
    push()
  }, RESULT_POLL_MS)
}

/** From 'will-quit': start the swap helper when an update is staged. */
export function swapOnQuit(): void {
  if (controller?.swapOnQuit()) console.log('[Updater] swap helper started')
}

/** Register the `UPDATE_*` invoke channels. */
export function registerUpdaterHandlers(): void {
  handleInvoke(IPC.UPDATE_GET_STATUS, () => getUpdateStatus())
  handleInvoke(IPC.UPDATE_CHECK, async () => {
    if (!controller) return
    manualCheck = true
    await controller.check(true)
  })
  handleInvoke(IPC.UPDATE_DOWNLOAD, () => {
    // Resolves at once; progress and the outcome arrive as status pushes.
    void controller?.download()
  })
  handleInvoke(IPC.UPDATE_CANCEL, () => controller?.cancel())
  handleInvoke(IPC.UPDATE_INSTALL, () => {
    void controller?.install()
  })
  handleInvoke(IPC.UPDATE_RESTART, async () => {
    if (controller?.status().state.phase !== 'readyToRestart') return
    // A cancelled save prompt keeps the app (and the staged update) as it was.
    await quitApp(false)
  })
  handleInvoke(IPC.UPDATE_OPEN_RELEASE, () => {
    const s = controller?.status().state
    const url = s && 'release' in s && s.release ? s.release.htmlUrl : RELEASES_PAGE
    void shell.openExternal(url)
  })
  handleInvoke(IPC.UPDATE_DISMISS_RESULT, () => {
    lastResult = null
  })
}
