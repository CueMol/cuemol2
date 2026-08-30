/**
 * @file main/windows/reveal.ts
 * @description When a held-back window goes on screen.
 *
 * Both windows are created hidden (`show: false` in windowChrome) and revealed
 * on the renderer's say-so -- `IPC.WINDOW_REVEAL`, sent once the first frame
 * worth looking at has painted. Electron's own `ready-to-show` fires on the
 * document's first paint, which for these pages is an empty root element:
 * React has not mounted yet, let alone fetched what the widgets show. So
 * revealing there put an unfurnished window on screen and let the user watch
 * it fill in, and the same for the main window at launch.
 *
 * `ready-to-show` still arms a fallback, so a renderer that never sends the
 * signal -- crashed during boot, or running without Electron's bridge -- is
 * shown anyway: late, rather than never.
 */

import type { BrowserWindow } from 'electron'

/**
 * How long after the page's first paint to wait for the renderer's signal.
 * The main window's takes ~750 ms on this machine (its first scene has to be
 * created by the worker first); the margin is for slower ones.
 */
export const REVEAL_FALLBACK_MS = 3000

const pending = new Map<BrowserWindow, () => void>()

/**
 * Keep `win` hidden until `revealWindow(win)` or the fallback, whichever
 * comes first; `reveal` runs exactly once, and not at all for a window that
 * closed while waiting.
 */
export function holdUntilRevealed(win: BrowserWindow, reveal: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const fire = (): void => {
    if (!pending.delete(win)) return
    if (timer) clearTimeout(timer)
    if (!win.isDestroyed()) reveal()
  }
  pending.set(win, fire)
  win.once('ready-to-show', () => {
    if (pending.has(win)) timer = setTimeout(fire, REVEAL_FALLBACK_MS)
  })
  win.once('closed', () => {
    pending.delete(win)
    if (timer) clearTimeout(timer)
  })
}

/** The renderer's signal. A window not being held (already shown) ignores it. */
export function revealWindow(win: BrowserWindow): void {
  pending.get(win)?.()
}
