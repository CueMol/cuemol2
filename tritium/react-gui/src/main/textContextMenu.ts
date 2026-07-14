/**
 * @file main/textContextMenu.ts
 * @description Generic right-click context menu for editable text fields and
 * selectable text (e.g. the log panel). Built from Electron's native
 * `webContents 'context-menu'` event so it covers every text surface without
 * per-component wiring.
 *
 * Cut/Copy/Paste are pure clipboard roles -- Electron runs them natively
 * against the focused element / current selection. Select All is NOT a native
 * role (Electron's selectAll selects the whole document); it routes back to the
 * renderer's scoped `selectAllInScope` via the supplied callback.
 *
 * The template builder is a pure function (given the params and the
 * select-all callback) so it can be unit-tested without Electron, and so the
 * "non-editable + no selection -> empty template" gate -- which keeps this from
 * colliding with the scene-tree / navi context menus -- stays pinned.
 */

import { Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { IPC } from '../shared/ipcChannels'
import { buildTextCtxMenuNodes } from '../shared/textCtxMenu'

/**
 * Subset of Electron's `ContextMenuParams` consumed by the template builder.
 * Declared locally so the builder stays Electron-independent and testable.
 */
export interface TextContextMenuParams {
  isEditable: boolean
  selectionText: string
  editFlags: {
    canCut: boolean
    canCopy: boolean
    canPaste: boolean
    canSelectAll: boolean
  }
}

/**
 * Build the clipboard context-menu template for a right-click.
 *
 * - Editable field: Cut / Copy / Paste (each enabled per the matching edit
 *   flag) + Select All.
 * - Non-editable but with selected text (e.g. log panel `<pre>`): Copy +
 *   Select All only.
 * - Non-editable with no selection: empty array, so no menu is shown. This is
 *   the gate that prevents a second menu over scene-tree rows / the 3D canvas,
 *   which surface their own React-invoked context menus and carry no selection.
 *
 * Select All items invoke `onSelectAll` (renderer-scoped) rather than the
 * native role, so they never select the whole document.
 *
 * @returns Electron menu template; empty when nothing clipboard-related applies.
 */
export function buildTextContextMenuTemplate(
  params: TextContextMenuParams,
  onSelectAll: () => void,
): MenuItemConstructorOptions[] {
  const { isEditable, selectionText, editFlags } = params
  const hasSelection = selectionText.trim().length > 0

  if (!isEditable && !hasSelection) return []

  const template: MenuItemConstructorOptions[] = []
  if (isEditable) {
    template.push({ role: 'cut', enabled: editFlags.canCut })
  }
  template.push({ role: 'copy', enabled: editFlags.canCopy })
  if (isEditable) {
    template.push({ role: 'paste', enabled: editFlags.canPaste })
  }
  template.push({ type: 'separator' })
  template.push({ label: 'Select All', click: onSelectAll })
  return template
}

/**
 * Register the `context-menu` listener on the window's webContents.
 *
 * macOS pops up the native clipboard menu (role-based). Windows / Linux
 * instead push the params to the renderer, which shows the shared React
 * `MenuPanel` (matching the menu bar dropdowns) and invokes the chosen
 * edit role back through `IPC.TEXT_CTX_ACTION`. Both paths show a menu
 * only when the template gate yields items, leaving scene-tree / navi
 * right-clicks to their existing menus.
 */
export function registerTextContextMenu(mainWindow: BrowserWindow): void {
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menuParams: TextContextMenuParams = {
      isEditable: params.isEditable,
      selectionText: params.selectionText,
      editFlags: {
        canCut: params.editFlags.canCut,
        canCopy: params.editFlags.canCopy,
        canPaste: params.editFlags.canPaste,
        canSelectAll: params.editFlags.canSelectAll,
      },
    }

    if (process.platform !== 'darwin') {
      // Same empty gate as the native path (via the shared node builder),
      // so no push happens for right-clicks with nothing clipboard-related.
      if (buildTextCtxMenuNodes(menuParams).length === 0) return
      mainWindow.webContents.send(IPC.TEXT_CTX_SHOW, {
        x: params.x,
        y: params.y,
        ...menuParams,
      })
      return
    }

    const template = buildTextContextMenuTemplate(
      menuParams,
      () => mainWindow.webContents.send(IPC.MENU_GENERIC, 'menu:select-all'),
    )
    if (template.length === 0) return
    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window: mainWindow })
  })
}
