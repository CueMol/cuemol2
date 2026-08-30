/**
 * @file main/windows/closeFunnel.ts
 * @description Letting the renderer answer for a window before it closes.
 */

import type { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipcChannels'
import { isCloseConfirmed, isCloseInFlight, setCloseInFlight } from '../quitState'

/**
 * Confirm funnel for window close. The first 'close' for a window
 * preventDefaults and asks the renderer to walk every tab through its
 * close-confirm flow (see quitState.ts). When the renderer replies via
 * IPC.WINDOW_CLOSE_PROCEED the window is marked confirmed and re-closed,
 * and this funnel lets the second 'close' through. The red-button and
 * Cmd+Q (which calls win.close() per window) both reach this funnel.
 *
 * There is deliberately no timeout here. A stopwatch cannot tell "the renderer
 * is stuck" from "the renderer is busy" or "the user is thinking", and the
 * chain shows a "Save changes?" confirm per modified scene -- so a timeout
 * fires on a slow decision and discards the very scenes it was asking about.
 * The two cases where the renderer genuinely cannot answer are covered
 * elsewhere: a crash exits through 'render-process-gone', and a hung renderer
 * is what the OS's own "application not responding" force-quit is for. If an
 * in-app escape is ever wanted for the hung case, it should ask (a native
 * message box from main) rather than close on its own.
 */
export function handleWindowClose(win: BrowserWindow, event: Electron.Event): void {
  if (isCloseConfirmed(win)) return
  event.preventDefault()
  // A confirm request is already being processed -- ignore the extra
  // close (e.g. red-button mashing, or Cmd+Q on top of a red-button).
  if (isCloseInFlight(win)) return
  setCloseInFlight(win, true)
  win.webContents.send(IPC.WINDOW_CLOSE_REQUEST)
}
