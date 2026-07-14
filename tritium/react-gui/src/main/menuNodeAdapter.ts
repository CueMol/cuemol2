/**
 * @file main/menuNodeAdapter.ts
 * @description Convert a platform-neutral `MenuNode` tree into an Electron
 * native menu template. This is the macOS presentation path for the shared
 * context-menu templates (Windows / Linux render the same nodes with the
 * React `MenuPanel` instead). Each node's `action` value is wrapped in a
 * `click` closure that reports the pick through `onPick`; Electron fires
 * `click` before the popup `callback`, so callers can capture the pick in a
 * closure and resolve after the menu closes (the pattern used by
 * `naviContextMenu.ts` / `sceneContextMenu.ts`).
 */
import type { MenuItemConstructorOptions } from 'electron'
import { collapseSeparators, isSeparatorNode } from '../shared/menuNodes'
import type { MenuNode } from '../shared/menuNodes'

/** Map `MenuNode`s to an Electron template, routing picks to `onPick`. */
export function toElectronTemplate<T>(
  nodes: ReadonlyArray<MenuNode<T>>,
  onPick: (action: T) => void,
): MenuItemConstructorOptions[] {
  // Collapse separators per level so a dropped optional group does not leave
  // a double rule (matches the React MenuPanel render path).
  return collapseSeparators(nodes).map((node) => {
    if (isSeparatorNode(node)) return { type: 'separator' as const }
    const item: MenuItemConstructorOptions = {
      label: node.label,
      enabled: node.enabled !== false,
    }
    if (node.type === 'checkbox' || node.type === 'radio') {
      item.type = node.type
      item.checked = node.checked === true
    }
    if (node.accelerator) item.accelerator = node.accelerator
    if (node.submenu) item.submenu = toElectronTemplate(node.submenu, onPick)
    const action = node.action
    if (action !== undefined) item.click = () => onPick(action)
    return item
  })
}
