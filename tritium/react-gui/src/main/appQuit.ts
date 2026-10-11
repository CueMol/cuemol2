/**
 * @file main/appQuit.ts
 * @description Quitting the app on request from outside it (tritium_cli `quit`).
 *
 * A normal quit goes the way Cmd+Q does -- `app.quit()` into 'before-quit',
 * the main window's close funnel and the renderer's save prompts -- and waits
 * for the verdict. The window is brought to the front first: the request
 * comes from a terminal that has focus, and a prompt behind it, or in a
 * minimized window, would leave the quit waiting on an answer nobody sees.
 *
 * A forced quit sets the same flags as the crash UI's Quit, but ends with
 * `app.quit()` rather than `app.exit()`, so 'will-quit' still runs and the
 * local API info file and the render history are cleaned up.
 */

import { app } from 'electron'
import { focusMainWindow, getMainWindow } from './windows/mainWindow'
import {
  setAppQuitting,
  setCloseConfirmed,
  setForceQuit,
  waitQuitOutcome,
} from './quitState'
import type { QuitOutcome } from './quitState'

/**
 * Quit the app.
 *
 * @param force - skip the save prompts
 * @returns how it ended; a forced quit always says `quit`
 */
export function quitApp(force: boolean): Promise<QuitOutcome> {
  const main = getMainWindow()
  if (force || !main) {
    setForceQuit(true)
    setAppQuitting(true)
    if (main) setCloseConfirmed(main, true)
    // After the caller's answer is on its way.
    setImmediate(() => app.quit())
    return Promise.resolve('quit')
  }
  focusMainWindow()
  if (process.platform === 'darwin') app.focus({ steal: true })
  const outcome = waitQuitOutcome()
  setImmediate(() => app.quit())
  return outcome
}
