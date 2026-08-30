/**
 * @file main/windows/windowState.ts
 * @description Remembering where a window was.
 *
 * Both windows persist their own geometry through the same two steps: decide
 * whether saved bounds still land on a display that exists, and write the
 * current bounds back as they change.
 */

import { screen, type BrowserWindow } from 'electron'
import type { WindowBounds } from '../stateStore'

/** How long to let a resize or move settle before writing it out. */
const PERSIST_DEBOUNCE_MS = 300

/**
 * Whether saved bounds still overlap a display enough to be reachable.
 *
 * The 100 px margins are what makes this a usability test rather than a
 * geometry one: a window whose last screen is gone, or that sits almost
 * entirely off the edge, has no grippable title bar left.
 */
export function isVisibleOnAnyDisplay(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const { x, y, width, height } = d.workArea
    return (
      bounds.x + bounds.width > x + 100 &&
      bounds.x < x + width - 100 &&
      bounds.y + bounds.height > y + 100 &&
      bounds.y < y + height - 100
    )
  })
}

/**
 * Persist a window's bounds as it is moved, resized and closed.
 *
 * @param loadBounds - the last saved bounds, used while maximized: the OS
 *   reports the maximized rectangle, which is not what should be restored to.
 */
export function trackWindowState(
  win: BrowserWindow,
  loadBounds: () => WindowBounds | undefined,
  saveBounds: (bounds: WindowBounds) => void,
): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const writeBounds = (): void => {
    if (win.isDestroyed()) return
    const isMaximized = win.isMaximized()
    const bounds = isMaximized ? (loadBounds() ?? win.getBounds()) : win.getBounds()
    saveBounds({ ...bounds, isMaximized })
  }

  const persist = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(writeBounds, PERSIST_DEBOUNCE_MS)
  }

  win.on('resize', persist)
  win.on('move', persist)
  win.on('maximize', persist)
  win.on('unmaximize', persist)
  // Write synchronously on close. Going through `persist` cancelled whatever
  // resize/move was still pending and re-scheduled it 300 ms past the point
  // where `win.isDestroyed()` becomes true, so moving or resizing a window and
  // closing it straight away lost the new geometry. For the Rendering window,
  // which has no confirm funnel to delay its teardown, that was every close.
  win.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    writeBounds()
  })
}
