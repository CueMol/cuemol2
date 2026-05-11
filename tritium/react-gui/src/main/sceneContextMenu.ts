import { Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import type {
    SceneCtxAction,
    SceneCtxMenuPayload,
    SceneCtxNodeType,
} from '../shared/ipcTypes'

/**
 * Native context menu shown when the user right-clicks a row in `ScenePane`.
 *
 * Phase 3a only wires the common items shared across node types
 * (Show/Hide, Rename, Delete, Properties). The selection submenu for
 * objects, paint/coloring for renderers, and camera/style file I/O
 * land in later phases of the workspace_panel migration.
 *
 * Mirrors the dispatch pattern in `main/naviContextMenu.ts`.
 */
export function showSceneContextMenu(
    mainWindow: BrowserWindow,
    payload: SceneCtxMenuPayload,
): Promise<SceneCtxAction | null> {
    return new Promise((resolve) => {
        let chosen: SceneCtxAction | null = null

        const action =
            (a: SceneCtxAction): MenuItemConstructorOptions['click'] =>
            () => {
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

function buildTemplate(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    const header: MenuItemConstructorOptions[] = [
        { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
        { type: 'separator' },
    ]

    // Phase 3a contents per node type. Items disabled here will be enabled
    // as later phases land their backing services.
    switch (payload.nodeType) {
        case 'scene':
            return [
                ...header,
                propertyItem(action),
            ]

        case 'object':
        case 'renderer':
        case 'rendGroup':
            return [
                ...header,
                ...showHideItems(payload, action),
                renameItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'camera':
            return [
                ...header,
                renameItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'style':
            return [
                ...header,
                renameItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'cameraRoot':
        case 'styleRoot':
        default:
            // Synthesised root containers — no operations in Phase 3a.
            return [
                { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
            ]
    }
}

function showHideItems(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    if (!payload.hasVisibility) return []
    if (payload.isVisible) {
        return [{ label: 'Hide', click: action('hide') }]
    }
    return [{ label: 'Show', click: action('show') }]
}

function renameItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Rename…', click: action('rename') }
}

function deleteItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Delete', click: action('delete') }
}

function propertyItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Properties…', click: action('property') }
}

function nodeTypeLabel(nodeType: SceneCtxNodeType): string {
    switch (nodeType) {
        case 'scene': return 'Scene'
        case 'object': return 'Object'
        case 'renderer': return 'Renderer'
        case 'rendGroup': return 'Renderer Group'
        case 'cameraRoot': return 'Cameras'
        case 'styleRoot': return 'Styles'
        case 'camera': return 'Camera'
        case 'style': return 'Style'
        default: return ''
    }
}
