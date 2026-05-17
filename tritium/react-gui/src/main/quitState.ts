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
