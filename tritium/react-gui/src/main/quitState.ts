/**
 * Tracks window-close and app-quit confirmation state.
 *
 * Closing a window (traffic-light / X button) and quitting the app
 * (Cmd+Q) both funnel through `win.on('close')`. The first 'close' for a
 * window preventDefaults and asks that window's renderer to walk every tab
 * through its close-confirm flow. When the renderer replies via
 * IPC.WINDOW_CLOSE_PROCEED with `proceed: true`, the handler marks the
 * window confirmed and re-issues `win.close()`; the second 'close' sees the
 * confirmed flag and lets the window close.
 *
 * Two scopes of state:
 *   - per-window: `confirmed` (next 'close' may pass) and `inFlight`
 *     (a confirm request is being processed; suppress duplicate requests).
 *   - app-level: `appQuitting` marks that a Cmd+Q quit sequence is in
 *     progress so the re-entrant 'before-quit' lets the shutdown proceed.
 */

import type { BrowserWindow } from 'electron'

interface WindowCloseState {
  /** Confirmed: the next 'close' event must not be preventDefault'd. */
  confirmed: boolean
  /** A confirm request is being processed by the renderer right now. */
  inFlight: boolean
}

const windowStates = new WeakMap<BrowserWindow, WindowCloseState>()

function stateFor(win: BrowserWindow): WindowCloseState {
  let s = windowStates.get(win)
  if (!s) {
    s = { confirmed: false, inFlight: false }
    windowStates.set(win, s)
  }
  return s
}

export function isCloseConfirmed(win: BrowserWindow): boolean {
  return stateFor(win).confirmed
}

export function setCloseConfirmed(win: BrowserWindow, value: boolean): void {
  stateFor(win).confirmed = value
}

export function isCloseInFlight(win: BrowserWindow): boolean {
  return stateFor(win).inFlight
}

export function setCloseInFlight(win: BrowserWindow, value: boolean): void {
  stateFor(win).inFlight = value
}

// --- App-level quit sequence ---

let appQuitting = false

export function isAppQuitting(): boolean {
  return appQuitting
}

export function setAppQuitting(value: boolean): void {
  appQuitting = value
}

// --- Force-quit (crash / fallback UI / watchdog) ---

/**
 * Set when the normal confirm funnel must be bypassed -- the renderer is
 * known dead (render-process-gone), the user clicked Quit on the crash
 * fallback UI, or the close watchdog fired. `before-quit` short-circuits
 * on this flag so the quit sequence is not re-routed through the
 * window-close confirm chain.
 */
let forceQuit = false

export function isForceQuit(): boolean {
  return forceQuit
}

export function setForceQuit(value: boolean): void {
  forceQuit = value
}

// --- Close-request watchdog ---

/**
 * Time the main process will wait for a WINDOW_CLOSE_PROCEED reply before
 * assuming the renderer is wedged and forcing the window closed. Tuned to
 * avoid false positives during slow confirm dialogs; shorten if hangs
 * become a routine issue.
 */
export const WINDOW_CLOSE_WATCHDOG_MS = 10000

const closeWatchdogs = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>()

export function setCloseWatchdog(
  win: BrowserWindow,
  timer: ReturnType<typeof setTimeout>,
): void {
  closeWatchdogs.set(win, timer)
}

/**
 * Cancel the WINDOW_CLOSE_REQUEST watchdog for `win`. Called when the
 * renderer replies via WINDOW_CLOSE_PROCEED so the timer does not fire
 * after a successful confirm.
 */
export function clearCloseWatchdog(win: BrowserWindow): void {
  const timer = closeWatchdogs.get(win)
  if (timer !== undefined) {
    clearTimeout(timer)
    closeWatchdogs.delete(win)
  }
}

export function hasCloseWatchdog(win: BrowserWindow): boolean {
  return closeWatchdogs.has(win)
}
