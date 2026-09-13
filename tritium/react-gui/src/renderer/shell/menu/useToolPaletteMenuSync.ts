/**
 * @file shell/menu/useToolPaletteMenuSync.ts
 * @description Keeps the native View > Tool palette checkbox in step with the
 * renderer's layout flag.
 *
 * The palette's visibility lives in the persisted layout (`state/layout`), and
 * the native menu (macOS) cannot see renderer state, so every change -- a menu
 * click, the shortcut, the palette's cap, or the stored value restored at startup --
 * is pushed through `MENU_UPDATE_STATE`. The Windows / Linux React menu bar
 * derives the same check from `useMenuBarState` and needs no push.
 */
import { useEffect } from 'react'
import { IPC } from '@shared/ipcChannels'
import { useLayout } from '@renderer/state/layout'

/** Mirror `toolPaletteCollapsed` onto the native menu's checkbox. */
export function useToolPaletteMenuSync(): void {
  const { loaded, toolPaletteCollapsed } = useLayout()
  useEffect(() => {
    // Wait for the store: the template default is checked, and pushing the
    // pre-load default would only be overwritten a moment later.
    if (!loaded) return
    window.electronAPI
      ?.invoke(IPC.MENU_UPDATE_STATE, { toolPalette: { visible: !toolPaletteCollapsed } })
      .catch((err: unknown) => {
        console.warn('update menu state (tool palette) failed:', err)
      })
  }, [loaded, toolPaletteCollapsed])
}
