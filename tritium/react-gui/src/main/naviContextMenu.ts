/**
 * @file main/naviContextMenu.ts
 * @description Native (macOS) popup for the 3D-view atom right-click menu.
 * The menu structure lives in `shared/naviCtxMenu.ts`; this file only adapts
 * it to an Electron native menu. Windows / Linux render the same nodes with
 * the React `MenuPanel` in the renderer and never call this.
 */
import { Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import type { NaviCtxAction, NaviCtxMenuPayload } from '../shared/ipcTypes'
import { buildNaviCtxMenuNodes } from '../shared/naviCtxMenu'
import { toElectronTemplate } from './menuNodeAdapter'

export function showNaviContextMenu(
  mainWindow: BrowserWindow,
  payload: NaviCtxMenuPayload,
): Promise<NaviCtxAction | null> {
  return new Promise((resolve) => {
    let chosen: NaviCtxAction | null = null

    const template = toElectronTemplate(buildNaviCtxMenuNodes(payload), (action) => {
      chosen = action
    })

    const menu = Menu.buildFromTemplate(template)
    menu.popup({
      window: mainWindow,
      x: Math.round(payload.x),
      y: Math.round(payload.y),
      callback: () => resolve(chosen),
    })
  })
}
