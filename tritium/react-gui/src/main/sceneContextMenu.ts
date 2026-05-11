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
 * Action contract: each menu item's `click` handler stores a discriminated
 * `SceneCtxAction` payload in a closure-captured `chosen` slot. Electron
 * fires `click` **before** the menu's `callback`, so by the time the
 * Promise resolves, `chosen` holds the action (or null for dismiss).
 * Mirrors the dispatch pattern in `main/naviContextMenu.ts`.
 *
 * Phase coverage:
 *   - 3a: Show/Hide, Rename, Delete, Properties (common items)
 *   - 3b: Selection submenu on object nodes
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

    // Phase 3a/3b contents per node type. Items disabled here will be
    // enabled as later phases land their backing services.
    switch (payload.nodeType) {
        case 'scene':
            return [
                ...header,
                ...pasteItem(payload, 'object', action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'object':
            return [
                ...header,
                ...showHideItems(payload, action),
                selectionSubmenu(action),
                { type: 'separator' },
                renameItem(action),
                copyItem(action),
                ...pasteItem(payload, 'renderer', action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'renderer':
        case 'rendGroup':
            return [
                ...header,
                ...showHideItems(payload, action),
                renameItem(action),
                copyItem(action),
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
        return [{ label: 'Hide', click: action({ kind: 'hide' }) }]
    }
    return [{ label: 'Show', click: action({ kind: 'show' }) }]
}

function renameItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Rename…', click: action({ kind: 'rename' }) }
}

function deleteItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Delete', click: action({ kind: 'delete' }) }
}

function propertyItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Properties…', click: action({ kind: 'property' }) }
}

function copyItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Copy', click: action({ kind: 'copy' }) }
}

/**
 * Paste menu item — only shown when the worker clipboard holds the
 * matching kind. Scene rows accept object pastes; object rows accept
 * renderer pastes.
 */
function pasteItem(
    payload: SceneCtxMenuPayload,
    expectedKind: 'object' | 'renderer',
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    if (payload.clipboardKind !== expectedKind) return []
    const label = expectedKind === 'object' ? 'Paste Object' : 'Paste Renderer'
    return [{ label, click: action({ kind: 'paste' }) }]
}

function selectionSubmenu(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return {
        label: 'Selection',
        submenu: [
            { label: 'All', click: action({ kind: 'selectMol', selectKind: 'all' }) },
            { label: 'Unselect', click: action({ kind: 'selectMol', selectKind: 'unselect' }) },
            { label: 'Invert', click: action({ kind: 'selectMol', selectKind: 'invert' }) },
            { type: 'separator' },
            { label: 'Protein', click: action({ kind: 'selectMol', selectKind: 'protein' }) },
            { label: 'Nucleic', click: action({ kind: 'selectMol', selectKind: 'nucleic' }) },
            { label: 'Water', click: action({ kind: 'selectMol', selectKind: 'water' }) },
            { label: 'Sugar', click: action({ kind: 'selectMol', selectKind: 'sugar' }) },
            { label: 'Hydrogen', click: action({ kind: 'selectMol', selectKind: 'hydrogen' }) },
            { type: 'separator' },
            { label: 'Toggle Sidechain', click: action({ kind: 'selectMol', selectKind: 'sidechain' }) },
        ],
    }
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
