/**
 * @file main/contextMenu/sceneCtxTemplates.ts
 * @description Per-node-type menu templates for the scene-tree native
 * context menu. `buildTemplate` dispatches on `payload.nodeType` to the
 * scene / object / renderer / rendGroup branches and the camera / style
 * node builders below; the leaf item / submenu builders live in
 * `./sceneCtxItems.ts`.
 *
 * Every function here is a pure mapping from `SceneCtxMenuPayload` to
 * Electron `MenuItemConstructorOptions[]` — no module state, no Electron
 * APIs. `sceneContextMenu.ts` keeps the popup entry point.
 */

import type { MenuItemConstructorOptions } from 'electron'
import type { SceneCtxMenuPayload } from '../../shared/ipcTypes'
import {
    type SceneCtxActionFn,
    bgColorSubmenu,
    changeSelSubmenu,
    changeTypeSubmenu,
    coloringSubmenu,
    colorProofingItem,
    copyItem,
    deleteItem,
    generateSurfObjItem,
    newRendGroupItem,
    newRendererItem,
    nodeTypeLabel,
    paintSubmenu,
    pasteItem,
    propertyItem,
    renameItem,
    selectionSubmenu,
    showHideItems,
    styleSubmenu,
} from './sceneCtxItems'

export function buildTemplate(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    // Phase 4c: when multiple nodes are selected, the multi menu wins
    // and the type-specific branches below are bypassed. UXP equivalent:
    // `wspcPanelMulCtxtMenu` (workspace_panel.xul).
    const multi = payload.multiNodeIds ?? []
    if (multi.length > 1) {
        return [
            { label: `${multi.length} items selected`, enabled: false },
            { type: 'separator' },
            { label: 'Show', click: action({ kind: 'multiShow' }) },
            { label: 'Hide', click: action({ kind: 'multiHide' }) },
            { type: 'separator' },
            { label: 'Delete', click: action({ kind: 'multiDelete' }) },
        ]
    }

    const header: MenuItemConstructorOptions[] = [
        { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
        { type: 'separator' },
    ]

    switch (payload.nodeType) {
        case 'scene':
            return [
                ...header,
                bgColorSubmenu(payload, action),
                colorProofingItem(payload, action),
                { type: 'separator' },
                ...pasteItem(payload, 'object', action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'object':
            return [
                ...header,
                ...showHideItems(payload, action),
                selectionSubmenu(action),
                ...paintSubmenu(payload, action),
                { type: 'separator' },
                renameItem(action),
                copyItem(action),
                ...pasteItem(payload, 'renderer', action),
                newRendererItem(action),
                newRendGroupItem(action),
                { label: 'Save As…', click: action({ kind: 'saveAsObject' }) },
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'renderer':
            return [
                ...header,
                ...showHideItems(payload, action),
                ...changeSelSubmenu(payload, action),
                ...changeTypeSubmenu(payload, action),
                ...coloringSubmenu(payload, action),
                ...paintSubmenu(payload, action),
                ...styleSubmenu(payload, action),
                { label: 'Edit style…', click: action({ kind: 'editRendStyle' }) },
                { label: 'Create style…', click: action({ kind: 'createRendStyle' }) },
                ...generateSurfObjItem(payload, action),
                { type: 'separator' },
                renameItem(action),
                copyItem(action),
                newRendererItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'rendGroup':
            return [
                ...header,
                ...showHideItems(payload, action),
                renameItem(action),
                copyItem(action),
                ...pasteItem(payload, 'renderer', action),
                newRendererItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'camera':
            return buildCameraNodeMenu(payload, header, action)

        case 'cameraRoot':
            return buildCameraRootMenu(payload, header, action)

        case 'style':
            return buildStyleNodeMenu(payload, header, action)

        case 'styleRoot':
            return buildStyleRootMenu(payload, header, action)

        default:
            return [
                { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
            ]
    }
}

/**
 * Camera row context menu (Phase 5b) — UXP `wspcPanelCameraCtxtMenu` with
 * `onCamCtxtShowing` gating:
 *   - Copy / Paste — Copy enabled for cameras; Paste enabled when the
 *     worker clipboard holds a 'camera' entry
 *   - Camera file submenu — Reload only when src is non-empty
 *   - Edit vis flags... — dialog dep (Phase 6c); item is rendered disabled
 *   - Clear vis flags — enabled only when vis_size > 0
 */
function buildCameraNodeMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    const info = payload.cameraInfo
    const hasSrc = (info?.src ?? '').length > 0
    const hasVis = (info?.visSize ?? 0) > 0

    return [
        ...header,
        { label: 'New Camera…', click: action({ kind: 'newCamera' }) },
        { type: 'separator' },
        { label: 'Copy', click: action({ kind: 'copy' }) },
        ...pasteItem(payload, 'camera', action),
        { label: 'Delete', click: action({ kind: 'delete' }) },
        { type: 'separator' },
        {
            label: 'Camera file',
            submenu: [
                { label: 'Load…', click: action({ kind: 'cameraLoad' }) },
                {
                    label: 'Reload',
                    enabled: hasSrc,
                    click: action({ kind: 'cameraReload' }),
                },
                { label: 'Save', click: action({ kind: 'cameraSave' }) },
                { label: 'Save As…', click: action({ kind: 'cameraSaveAs' }) },
            ],
        },
        { type: 'separator' },
        {
            label: 'Save from view',
            click: action({ kind: 'cameraSaveFromView', withVisFlags: false }),
        },
        {
            label: 'Apply to view',
            click: action({ kind: 'cameraApplyToView', withVisFlags: false }),
        },
        { type: 'separator' },
        {
            label: 'Save from scene (with vis flags)',
            click: action({ kind: 'cameraSaveFromView', withVisFlags: true }),
        },
        {
            label: 'Apply to scene (with vis flags)',
            click: action({ kind: 'cameraApplyToView', withVisFlags: true }),
        },
        {
            label: 'Edit vis flags…',
            click: action({ kind: 'cameraEditVisFlags' }),
        },
        {
            label: 'Clear vis flags',
            enabled: hasVis,
            click: action({ kind: 'cameraClearVisFlags' }),
        },
        { type: 'separator' },
        renameItem(action),
        { type: 'separator' },
        propertyItem(action),
    ]
}

/**
 * Camera root row context menu (Phase 5b). UXP `wspcPanelCameraCtxtMenu`
 * disables everything except New Camera + Camera-file Load + Paste when
 * the selected element is the cameraRoot rather than an individual camera.
 */
function buildCameraRootMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    return [
        ...header,
        { label: 'New Camera…', click: action({ kind: 'newCamera' }) },
        ...pasteItem(payload, 'camera', action),
        { type: 'separator' },
        {
            label: 'Camera file',
            submenu: [{ label: 'Load…', click: action({ kind: 'cameraLoad' }) }],
        },
    ]
}

/**
 * Style row context menu (Phase 5c) — UXP `wspcStyleCtxtMenu` with
 * `onStyCtxtShowing` gating:
 *   - Copy / Delete / Save / Save As — disabled on global rows (scope==0)
 *   - Style file submenu — Reload only when src is non-empty (external)
 *   - Read-only checkbox — disabled on global rows OR when modified
 *   - Rename — UXP has no JS implementation; omitted
 */
function buildStyleNodeMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    const info = payload.styleInfo
    const isGlobal = info?.scopeId === 0
    const hasSrc = (info?.src ?? '').length > 0
    const isReadOnly = info?.readonly === true
    const isModified = info?.modified === true

    return [
        ...header,
        { label: 'New Style…', click: action({ kind: 'newStyle' }) },
        { type: 'separator' },
        {
            label: 'Copy',
            enabled: !isGlobal,
            click: action({ kind: 'copy' }),
        },
        ...pasteItem(payload, 'style', action),
        {
            label: 'Delete',
            enabled: !isGlobal,
            click: action({ kind: 'delete' }),
        },
        { type: 'separator' },
        {
            label: 'Style file',
            submenu: [
                { label: 'Load…', click: action({ kind: 'styleLoad' }) },
                {
                    label: 'Reload',
                    enabled: hasSrc,
                    click: action({ kind: 'styleReload' }),
                },
                {
                    label: 'Save',
                    enabled: !isGlobal,
                    click: action({ kind: 'styleSave' }),
                },
                {
                    label: 'Save As…',
                    enabled: !isGlobal,
                    click: action({ kind: 'styleSaveAs' }),
                },
            ],
        },
        { type: 'separator' },
        {
            label: 'Read-only',
            type: 'checkbox',
            checked: isReadOnly,
            // Mirrors UXP `onStyCtxtShowing`: disable on global rows and on
            // RW-but-modified rows (transition to RO is unsafe).
            enabled: !isGlobal && !(isReadOnly === false && isModified),
            click: action({ kind: 'styleToggleReadOnly' }),
        },
        { type: 'separator' },
        propertyItem(action),
    ]
}

/**
 * Style root row context menu (Phase 5c). Mirrors UXP onStyCtxtShowing
 * fall-through branch for the styles top-node: only New Style + Paste
 * (when clipboard has a style entry) + Load File apply.
 */
function buildStyleRootMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    return [
        ...header,
        { label: 'New Style…', click: action({ kind: 'newStyle' }) },
        ...pasteItem(payload, 'style', action),
        { type: 'separator' },
        {
            label: 'Style file',
            submenu: [{ label: 'Load…', click: action({ kind: 'styleLoad' }) }],
        },
    ]
}
