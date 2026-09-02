/**
 * @file shell/keybindings/useMenuKeyBindings.ts
 * @description Windows / Linux owner of the menu shortcuts: a window-level
 * keydown listener that turns an `APP_MENU` accelerator into the same
 * `dispatchMenuChannel` call a menu pick makes.
 *
 * Why the renderer, and why not on macOS:
 *
 * On macOS the native menu's key equivalent receives Cmd+V before the web
 * content does, so the main process's click handler fires and relays the
 * channel to the renderer. On Windows / Linux the order is reversed: the key
 * goes to the renderer first and a menu accelerator fires only if the renderer
 * leaves the event unhandled. Blink treats Ctrl+X/C/V/A as editing commands
 * and runs them even when focus is not in a text field (it has to dispatch the
 * DOM `copy` / `paste` events), so it always reports the key as handled and
 * the accelerator never fires -- Paste in the scene tree did nothing. The menu
 * bar is hidden on those platforms anyway (the React MenuBar stands in for
 * it), so the renderer owns every ipcChannel shortcut there and the native
 * menu registers none (main/menu.ts). One owner per platform; both enter the
 * same command bus.
 *
 * What the dispatcher mirrors from the native menu:
 *   - enabled state: a disabled item's accelerator does nothing, so the
 *     bindings are resolved through `resolveAppMenuNodes` with the same live
 *     state the MenuBar renders from (scene-op gating and the like);
 *   - the modal block: while a dialog is open, only the text-edit items
 *     (`TEXT_EDIT_MENU_IDS`) still fire, exactly the set main/menuBlock.ts
 *     spares on macOS;
 *   - focus-independence: the text-edit shortcuts are dispatched even from a
 *     text field. `utils/editClipboard.ts` then runs the native edit through
 *     main, as it does for the macOS menu path; preventDefault keeps Blink
 *     from also pasting on its own.
 *
 * Role items (Quit, DevTools, Zoom, Fullscreen, Reload) keep their Electron
 * default accelerators: those are not editing keys, so Blink lets them
 * through to the native menu on every platform.
 */
import { useEffect, useMemo } from 'react'
import { APP_MENU, TEXT_EDIT_MENU_IDS } from '@shared/menuTemplate'
import { acceleratorMatchesKey, parseAccelerator } from '@shared/menuAccel'
import type { ParsedAccelerator } from '@shared/menuAccel'
import type { MenuNode } from '@shared/menuNodes'
import { useMenuDispatch } from '@renderer/hooks/useMenuDispatch'
import { isEditModalOpen } from '@renderer/utils/editClipboard'
import { resolveAppMenuNodes } from '@renderer/shell/menu/resolveAppMenu'
import type { MenuBarPick, MenuBarStateContext } from '@renderer/shell/menu/resolveAppMenu'
import { useMenuBarState } from '@renderer/shell/menu/useMenuBarState'

/** One shortcut the renderer answers for. */
export interface MenuKeyBinding {
  /** Template item id ('paste', 'open-file', ...); '' for id-less items. */
  id: string
  /** The menu channel to dispatch, e.g. IPC.MENU_EDIT_PASTE. */
  channel: string
  acc: ParsedAccelerator
  /** Live enabled state, as the MenuBar would render it. */
  enabled: boolean
}

/** Collect the accelerator-bearing leaf items of a resolved node tree. */
function collectFromNodes(nodes: MenuNode<MenuBarPick>[], out: MenuKeyBinding[]): void {
  for (const node of nodes) {
    if (node.type === 'separator') continue
    if (node.submenu) {
      collectFromNodes(node.submenu, out)
      continue
    }
    const action = node.action
    if (!node.accelerator || !action || action.kind !== 'item' || !action.item.ipcChannel) continue
    out.push({
      id: action.item.id ?? '',
      channel: action.item.ipcChannel,
      // Non-mac: this dispatcher never runs on darwin.
      acc: parseAccelerator(node.accelerator, false),
      enabled: node.enabled !== false,
    })
  }
}

/**
 * Resolve `APP_MENU` against the live state and list every shortcut the
 * renderer owns, with its current enabled flag. Pure; exported for tests.
 */
export function collectMenuKeyBindings(ctx: MenuBarStateContext): MenuKeyBinding[] {
  const out: MenuKeyBinding[] = []
  for (const group of APP_MENU) {
    if (group.darwinOnly) continue
    collectFromNodes(resolveAppMenuNodes(group.submenu, ctx), out)
  }
  return out
}

/**
 * Install the Windows / Linux menu-shortcut dispatcher for the lifetime of
 * the component. No-op on macOS, where the native menu owns the keys.
 */
export function useMenuKeyBindings(): void {
  const isMac = window.electronAPI?.platform === 'darwin'
  const ctx = useMenuBarState()
  const { dispatchMenuChannel } = useMenuDispatch()

  const bindings = useMemo(() => (isMac ? [] : collectMenuKeyBindings(ctx)), [ctx, isMac])

  useEffect(() => {
    if (isMac) return
    const handler = (e: KeyboardEvent) => {
      // A key that is part of an IME composition belongs to the IME.
      if (e.isComposing) return
      const hit = bindings.find((b) => acceleratorMatchesKey(b.acc, e))
      if (!hit) return
      // A disabled menu item's accelerator is inert; let the key fall through.
      if (!hit.enabled) return
      // The modal block (main/menuBlock.ts) spares only the text-edit items.
      if (isEditModalOpen() && !TEXT_EDIT_MENU_IDS.has(hit.id)) return
      e.preventDefault()
      dispatchMenuChannel(hit.channel)
    }
    // Capture phase: ahead of Blueprint and the panes' own onKeyDown handlers,
    // which is where the native accelerator sat in the macOS ordering.
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [bindings, dispatchMenuChannel, isMac])
}
