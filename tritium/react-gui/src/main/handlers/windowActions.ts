/**
 * @file main/handlers/windowActions.ts
 * @description Window-scoped requests from the renderer: the close funnel's
 * verdict, crash reports, the crash UI's force-quit, menu roles, focus, and
 * the window title.
 *
 * The close verdict is the interesting one: `WINDOW_CLOSE_PROCEED` is the
 * renderer's answer to a close the main process paused, so it either confirms
 * and re-closes, or releases the quit state it had set.
 */

import { app, BrowserWindow } from 'electron';
import { IPC } from '@shared/ipcChannels';
import { APP_PRODUCT_NAME } from '@shared/appInfo';
import { handleInvoke } from '../ipc/handleInvoke';
import {
  setAppQuitting,
  setCloseConfirmed,
  setCloseInFlight,
  setForceQuit,
} from '../quitState';

/** Register the window-scoped channels. */
export function registerWindowHandlers(mainWindow: BrowserWindow): void {
  handleInvoke(IPC.WINDOW_CLOSE_PROCEED, (_event, { proceed }) => {
    setCloseInFlight(mainWindow, false)
    if (proceed) {
      setCloseConfirmed(mainWindow, true)
      mainWindow.close()
    } else {
      setAppQuitting(false)
    }
  })

  // Renderer-side crash report. The renderer's CrashReporter forwards
  // every crash source (window.onerror, unhandledrejection, ErrorBoundary,
  // worker.onerror, worker postMessage crash, render-loop) here so the
  // stack lands in stderr regardless of whether DevTools is open.
  handleInvoke(IPC.CRASH_REPORT, (_event, report) => {
    console.error('[Crash][' + report.source + ']', report.message)
    if (report.filename) {
      const loc = report.lineno !== undefined
        ? `${report.filename}:${report.lineno}:${report.colno ?? 0}`
        : report.filename
      console.error('  at', loc)
    }
    if (report.stack) console.error(report.stack)
    if (report.componentStack) {
      console.error('Component stack:' + report.componentStack)
    }
  })

  // Quit button on the crash fallback UI. Bypass the close-confirm funnel
  // entirely -- the renderer is broken so there is nothing to confirm.
  handleInvoke(IPC.FORCE_QUIT, () => {
    setForceQuit(true)
    setAppQuitting(true)
    for (const w of mainWindow.isDestroyed() ? [] : [mainWindow]) {
      setCloseConfirmed(w, true)
    }
    app.exit(0)
  })

  /**
   * The two roles the menu template actually carries.
   *
   * The switch used to answer ten, but only `quit` and `toggleDevTools` are
   * declared as `role:` anywhere in `menuTemplate.ts` -- the edit roles resolve
   * by focus (`utils/editClipboard.ts`), the macOS app-menu roles are native,
   * and reload / zoom / fullscreen / about / close were never wired to an item
   * at all. The zoom cases in particular read as a working feature: they drove
   * an app-wide `setZoomLevel` that the Rendering window still adopts on open,
   * so the plumbing looked complete from either end while nothing could ever
   * trigger it.
   */
  handleInvoke(IPC.MENU_INVOKE_ROLE, (event, role) => {
    // Act on the window that asked. The Rendering window has its own menu
    // bar, and routing its DevTools toggle to the main window opened the
    // wrong inspector.
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    if (win.isDestroyed()) return;
    switch (role) {
      case 'toggleDevTools': win.webContents.toggleDevTools(); break;
      case 'quit': app.quit(); break;
    }
  })

  /**
   * Window > Main Window. The Rendering window is an independent top-level
   * window (not a child), so normal z-order applies and a plain focus() is
   * enough to raise the main window above it. Minimized / hidden are restored
   * first so the entry always ends with the window on screen.
   */
  // Kept local rather than delegating to windowManager.focusMainWindow():
  // windowManager already imports this module, and the window is in hand here.
  handleInvoke(IPC.WINDOW_FOCUS_MAIN, () => {
    if (mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  // Window title: '<product> - <scene>:<view>', or the bare product name
  // when no molview tab is active. Mirrors UXP `Qm2Main.setWindowTitle`;
  // the renderer owns the active scene/view so it supplies the subtitle.
  handleInvoke(IPC.WINDOW_SET_TITLE, (_event, { subtitle }) => {
    if (mainWindow.isDestroyed()) return
    const trimmed = subtitle.trim()
    mainWindow.setTitle(
      trimmed ? `${APP_PRODUCT_NAME} - ${trimmed}` : APP_PRODUCT_NAME,
    )
  })
}
