import { Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import type { SceneCtxAction, SceneCtxMenuPayload } from '../shared/ipcTypes'
import type { SceneCtxActionFn } from './contextMenu/sceneCtxItems'
import { buildTemplate } from './contextMenu/sceneCtxTemplates'

/**
 * Native context menu shown when the user right-clicks a row in `ScenePane`.
 *
 * Action contract: each menu item's `click` handler stores a discriminated
 * `SceneCtxAction` payload in a closure-captured `chosen` slot. Electron
 * fires `click` **before** the menu's `callback`, so by the time the
 * Promise resolves, `chosen` holds the action (or null for dismiss).
 * Mirrors the dispatch pattern in `main/naviContextMenu.ts`.
 *
 * The per-node-type menu structure lives in `./contextMenu/sceneCtxTemplates.ts`
 * (`buildTemplate`); the leaf item / submenu builders live in
 * `./contextMenu/sceneCtxItems.ts`.
 */
export function showSceneContextMenu(
    mainWindow: BrowserWindow,
    payload: SceneCtxMenuPayload,
): Promise<SceneCtxAction | null> {
    return new Promise((resolve) => {
        let chosen: SceneCtxAction | null = null

        const action: SceneCtxActionFn = (a: SceneCtxAction) => () => {
            chosen = a
        }

        const template = buildTemplate(payload, action)
        const menu = Menu.buildFromTemplate(template)
        menu.popup({
            window: mainWindow,
            x: Math.round(payload.x),
            y: Math.round(payload.y),
            callback: () => resolve(chosen),
        })
    })
}
