/**
 * @file shared/sceneCtxMenu/sceneCtxTemplates.ts
 * @description Per-node-type menu templates for the scene-tree context
 * menu. `buildTemplate` dispatches on `payload.nodeType` to the
 * scene / object / renderer / rendGroup branches and the camera / style
 * node builders below; the leaf item / submenu builders live in
 * `./sceneCtxItems.ts`.
 *
 * Every function here is a pure mapping from `SceneCtxMenuPayload` to
 * platform-neutral `MenuNode<SceneCtxAction>`s -- no module state, no
 * Electron APIs. Windows / Linux render the nodes with the React
 * `MenuPanel`; macOS converts them to a native menu in
 * `main/sceneContextMenu.ts`.
 */

import type { SceneCtxMenuPayload } from '../ipcTypes'
import {
    type SceneCtxNode,
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
    regenSurfaceItem,
    renameItem,
    selectionSubmenu,
    showHideItems,
    styleSubmenu,
} from './sceneCtxItems'

export function buildTemplate(payload: SceneCtxMenuPayload): SceneCtxNode[] {
    // When multiple nodes are selected, the multi menu wins and the
    // type-specific branches below are bypassed. UXP equivalent:
    // `wspcPanelMulCtxtMenu` (workspace_panel.xul).
    const multi = payload.multiNodeIds ?? []
    if (multi.length > 1) {
        return [
            { label: `${multi.length} items selected`, enabled: false },
            { type: 'separator' },
            { label: 'Copy', action: { kind: 'multiCopy' } },
            { type: 'separator' },
            { label: 'Show', action: { kind: 'multiShow' } },
            { label: 'Hide', action: { kind: 'multiHide' } },
            { type: 'separator' },
            { label: 'Delete', action: { kind: 'multiDelete' } },
        ]
    }

    const header: SceneCtxNode[] = [
        { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
        { type: 'separator' },
    ]

    switch (payload.nodeType) {
        case 'scene':
            return [
                ...header,
                bgColorSubmenu(payload),
                colorProofingItem(payload),
                { type: 'separator' },
                ...pasteItem(payload, 'object'),
                { type: 'separator' },
                propertyItem(),
            ]

        case 'object':
            return [
                ...header,
                ...showHideItems(payload),
                ...regenSurfaceItem(payload),
                selectionSubmenu(),
                ...paintSubmenu(payload),
                { type: 'separator' },
                renameItem(),
                copyItem(),
                ...pasteItem(payload, 'renderer'),
                newRendererItem(),
                newRendGroupItem(),
                { label: 'Save As…', action: { kind: 'saveAsObject' } },
                deleteItem(),
                { type: 'separator' },
                propertyItem(),
            ]

        case 'renderer':
            return [
                ...header,
                ...showHideItems(payload),
                ...changeSelSubmenu(payload),
                ...changeTypeSubmenu(payload),
                ...coloringSubmenu(payload),
                ...paintSubmenu(payload),
                ...styleSubmenu(payload),
                { label: 'Edit style…', action: { kind: 'editRendStyle' } },
                { label: 'Create style…', action: { kind: 'createRendStyle' } },
                ...generateSurfObjItem(payload),
                ...(payload.canEditInteractions
                    ? [{ label: 'Edit interaction list…', action: { kind: 'editInteractionList' as const } } as SceneCtxNode]
                    : []),
                { type: 'separator' },
                renameItem(),
                copyItem(),
                newRendererItem(),
                deleteItem(),
                { type: 'separator' },
                propertyItem(),
            ]

        case 'rendGroup':
            return [
                ...header,
                ...showHideItems(payload),
                renameItem(),
                copyItem(),
                ...pasteItem(payload, 'renderer'),
                newRendererItem(),
                deleteItem(),
                { type: 'separator' },
                propertyItem(),
            ]

        case 'camera':
            return buildCameraNodeMenu(payload, header)

        case 'cameraRoot':
            return buildCameraRootMenu(payload, header)

        case 'style':
            return buildStyleNodeMenu(payload, header)

        case 'styleRoot':
            return buildStyleRootMenu(payload, header)

        default:
            return [
                { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
            ]
    }
}

/**
 * Camera row context menu -- UXP `wspcPanelCameraCtxtMenu` with
 * `onCamCtxtShowing` gating:
 *   - Copy / Paste -- Copy enabled for cameras; Paste enabled when the
 *     worker clipboard holds a 'camera' entry
 *   - Camera file submenu -- Reload only when src is non-empty
 *   - Edit vis flags... -- opens the shared vis-flags dialog
 *   - Clear vis flags -- enabled only when vis_size > 0
 */
function buildCameraNodeMenu(
    payload: SceneCtxMenuPayload,
    header: SceneCtxNode[],
): SceneCtxNode[] {
    const info = payload.cameraInfo
    const hasSrc = (info?.src ?? '').length > 0
    const hasVis = (info?.visSize ?? 0) > 0

    return [
        ...header,
        { label: 'New Camera…', action: { kind: 'newCamera' } },
        { type: 'separator' },
        { label: 'Copy', action: { kind: 'copy' } },
        ...pasteItem(payload, 'camera'),
        { label: 'Delete', action: { kind: 'delete' } },
        { type: 'separator' },
        {
            label: 'Camera file',
            submenu: [
                { label: 'Load…', action: { kind: 'cameraLoad' } },
                {
                    label: 'Reload',
                    enabled: hasSrc,
                    action: { kind: 'cameraReload' },
                },
                { label: 'Save', action: { kind: 'cameraSave' } },
                { label: 'Save As…', action: { kind: 'cameraSaveAs' } },
            ],
        },
        { type: 'separator' },
        {
            label: 'Save from view',
            action: { kind: 'cameraSaveFromView', withVisFlags: false },
        },
        {
            label: 'Apply to view',
            action: { kind: 'cameraApplyToView', withVisFlags: false },
        },
        { type: 'separator' },
        {
            label: 'Save from scene (with vis flags)',
            action: { kind: 'cameraSaveFromView', withVisFlags: true },
        },
        {
            label: 'Apply to scene (with vis flags)',
            action: { kind: 'cameraApplyToView', withVisFlags: true },
        },
        {
            label: 'Edit vis flags…',
            action: { kind: 'cameraEditVisFlags' },
        },
        {
            label: 'Clear vis flags',
            enabled: hasVis,
            action: { kind: 'cameraClearVisFlags' },
        },
        { type: 'separator' },
        renameItem(),
        { type: 'separator' },
        propertyItem(),
    ]
}

/**
 * Camera root row context menu. UXP `wspcPanelCameraCtxtMenu`
 * disables everything except New Camera + Camera-file Load + Paste when
 * the selected element is the cameraRoot rather than an individual camera.
 */
function buildCameraRootMenu(
    payload: SceneCtxMenuPayload,
    header: SceneCtxNode[],
): SceneCtxNode[] {
    return [
        ...header,
        { label: 'New Camera…', action: { kind: 'newCamera' } },
        ...pasteItem(payload, 'camera'),
        { type: 'separator' },
        {
            label: 'Camera file',
            submenu: [{ label: 'Load…', action: { kind: 'cameraLoad' } }],
        },
    ]
}

/**
 * Style row context menu -- UXP `wspcStyleCtxtMenu` with
 * `onStyCtxtShowing` gating:
 *   - Copy / Delete / Save / Save As -- disabled on global rows (scope==0)
 *   - Style file submenu -- Reload only when src is non-empty (external)
 *   - Read-only checkbox -- disabled on global rows OR when modified
 *   - Rename -- UXP has no JS implementation; omitted
 */
function buildStyleNodeMenu(
    payload: SceneCtxMenuPayload,
    header: SceneCtxNode[],
): SceneCtxNode[] {
    const info = payload.styleInfo
    const isGlobal = info?.scopeId === 0
    const hasSrc = (info?.src ?? '').length > 0
    const isReadOnly = info?.readonly === true
    const isModified = info?.modified === true

    return [
        ...header,
        { label: 'New Style…', action: { kind: 'newStyle' } },
        { type: 'separator' },
        {
            label: 'Copy',
            enabled: !isGlobal,
            action: { kind: 'copy' },
        },
        ...pasteItem(payload, 'style'),
        {
            label: 'Delete',
            enabled: !isGlobal,
            action: { kind: 'delete' },
        },
        { type: 'separator' },
        {
            label: 'Style file',
            submenu: [
                { label: 'Load…', action: { kind: 'styleLoad' } },
                {
                    label: 'Reload',
                    enabled: hasSrc,
                    action: { kind: 'styleReload' },
                },
                {
                    label: 'Save',
                    enabled: !isGlobal,
                    action: { kind: 'styleSave' },
                },
                {
                    label: 'Save As…',
                    enabled: !isGlobal,
                    action: { kind: 'styleSaveAs' },
                },
            ],
        },
        { type: 'separator' },
        { label: 'Edit…', action: { kind: 'editStyle' } },
        {
            label: 'Read-only',
            type: 'checkbox',
            checked: isReadOnly,
            // Mirrors UXP `onStyCtxtShowing`: disable on global rows and on
            // RW-but-modified rows (transition to RO is unsafe).
            enabled: !isGlobal && !(isReadOnly === false && isModified),
            action: { kind: 'styleToggleReadOnly' },
        },
        { type: 'separator' },
        propertyItem(),
    ]
}

/**
 * Style root row context menu. Mirrors UXP onStyCtxtShowing
 * fall-through branch for the styles top-node: only New Style + Paste
 * (when clipboard has a style entry) + Load File apply.
 */
function buildStyleRootMenu(
    payload: SceneCtxMenuPayload,
    header: SceneCtxNode[],
): SceneCtxNode[] {
    return [
        ...header,
        { label: 'New Style…', action: { kind: 'newStyle' } },
        ...pasteItem(payload, 'style'),
        { type: 'separator' },
        {
            label: 'Style file',
            submenu: [{ label: 'Load…', action: { kind: 'styleLoad' } }],
        },
    ]
}
