/**
 * Tracks whether the renderer has confirmed it is safe to quit.
 *
 * The first 'before-quit' event preventDefaults and asks the renderer to
 * walk every tab through its close-confirm flow. When the renderer replies
 * via IPC.APP_QUIT_PROCEED, the handler sets this flag and re-issues
 * app.quit(); the second 'before-quit' sees the flag and lets the
 * shutdown proceed.
 */

let isQuittingConfirmed = false

export function isQuitConfirmed(): boolean {
  return isQuittingConfirmed
}

export function setQuitConfirmed(value: boolean): void {
  isQuittingConfirmed = value
}
