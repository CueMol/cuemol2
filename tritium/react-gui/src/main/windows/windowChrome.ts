/**
 * @file main/windows/windowChrome.ts
 * @description The window options and webContents wiring both windows share.
 *
 * The main window and the Rendering window are deliberately dressed the same:
 * the same custom title bar, the same dark ground behind a page that has not
 * painted yet, the same single-click activate-and-act. They looked the same
 * because two copies of the options happened to agree, which is a resemblance
 * that survives only until someone edits one of them.
 */

import { app, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { getDevIconPath } from '../helpers/appIcon'

export const isMac = process.platform === 'darwin'

/** Ground colour behind an unpainted page, and the custom title bar's fill. */
const CHROME_BG = '#1e2028'

/**
 * The dressing shared by every window this app opens. Spread it, then add
 * what makes the window itself (size, title, minimums).
 *
 * @param opts.worker - allow Web Workers to use Node integration. Only the
 *   main window needs it: it hosts the CueMol worker, which loads the native
 *   addon. The Rendering window has no worker.
 */
export function chromeWindowOptions(
  opts: { worker?: boolean } = {},
): BrowserWindowConstructorOptions {
  const icon = getDevIconPath()
  return {
    // Created off screen; revealed when the renderer says its first real
    // frame is up (see reveal.ts). Electron shows a window as soon as it is
    // constructed unless told otherwise, so both windows used to appear empty
    // and then be furnished in front of the user.
    show: false,
    backgroundColor: CHROME_BG,
    // Window / taskbar icon for an unpackaged run on Windows and Linux
    // (undefined once packaged, and ignored on macOS -- see appIcon.ts).
    ...(icon ? { icon } : {}),
    // macOS: let a click on an inactive window activate it AND hit the clicked
    // control in the same click (the default needs a separate activating click
    // first). The two windows sit side by side, so whichever is inactive is
    // often the one being clicked. Ignored on other platforms.
    acceptFirstMouse: true,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: CHROME_BG,
            symbolColor: '#cccccc',
            height: 30,
          },
          autoHideMenuBar: true,
        }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      ...(opts.worker ? { nodeIntegrationInWorker: true } : {}),
      preload: join(__dirname, '../preload/index.js'),
    },
  }
}

/** Hide the platform menu bar where there is one in the window itself. */
export function hideMenuBar(win: BrowserWindow): void {
  if (!isMac) win.setMenuBarVisibility(false)
}

/**
 * Forward the window's console to stdout/stderr under `tag`.
 *
 * In a packaged app stdout is not attached to a terminal, so info/log level
 * messages are dropped: formatting and writing them costs main-process time
 * for output nobody sees. warn/error are always kept for crash diagnosis.
 */
export function forwardConsoleMessages(win: BrowserWindow, tag: string): void {
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2 && app.isPackaged) return
    const text = tag + ' ' + message + (sourceId ? ` (${sourceId}:${line})` : '')
    if (level === 3) console.error(text)
    else if (level === 2) console.warn(text)
    else console.log(text)
  })
}
