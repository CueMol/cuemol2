/**
 * @file main/sceneContextMenu.ts
 * @description Native (macOS) popup for the scene-tree right-click menu.
 *
 * The per-node-type menu structure lives in
 * `shared/sceneCtxMenu/sceneCtxTemplates.ts` (`buildTemplate`); this file
 * only adapts it to an Electron native menu. Windows / Linux render the
 * same nodes with the React `MenuPanel` in the renderer and never call
 * this.
 *
 * Action contract: `toElectronTemplate` wraps each node's action value in
 * a `click` handler that stores it in a closure-captured `chosen` slot.
 * Electron fires `click` **before** the menu's `callback`, so by the time
 * the Promise resolves, `chosen` holds the action (or null for dismiss).
 */
import { Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import type { SceneCtxAction, SceneCtxMenuPayload } from '../shared/ipcTypes'
import { buildTemplate } from '../shared/sceneCtxMenu/sceneCtxTemplates'
import { toElectronTemplate } from './menuNodeAdapter'

export function showSceneContextMenu(
    mainWindow: BrowserWindow,
    payload: SceneCtxMenuPayload,
): Promise<SceneCtxAction | null> {
    return new Promise((resolve) => {
        let chosen: SceneCtxAction | null = null

        const template = toElectronTemplate(buildTemplate(payload), (action) => {
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
