import { useCallback } from 'react'
import type {
    ChangeRendSelKind,
    RendColoringId,
    SceneCtxAction,
    SelectMolKind,
} from '../../shared/ipcTypes'
import { IPC } from '../../shared/ipcChannels'
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useShowTextPromptDialog } from '../components/dialogs/TextPromptDialogProvider'
import { useShowNewRendererDialog } from '../components/dialogs/NewRendererDialogProvider'
import { useShowApplyRendStyleDialog } from '../components/dialogs/ApplyRendStyleDialogProvider'
import { useShowCreateRendStyleDialog } from '../components/dialogs/CreateRendStyleDialogProvider'
import type { RendererOptions } from '../components/fopen-opt-dlgs/types'

/**
 * Renderer type names that don't support a `coloring` property — matches
 * UXP `checkColoring` in `workspace_panel_ctxtmenu.js`. The Coloring submenu
 * is hidden for these types.
 */
const RENDERER_TYPES_WITHOUT_COLORING = new Set([
    '*selection',
    '*namelabel',
    'atomintr',
])

/**
 * Opens the native scene-tree context menu and dispatches the returned
 * action against the appropriate worker service via the callbacks supplied
 * by `useSceneTree`. Mirrors the pattern in `useNaviContextMenu`.
 *
 * Phase 3a: Show / Hide, Rename (window.prompt-based), Delete, Properties.
 * Phase 3b: object Selection submenu (selectMol-* actions).
 * Phase 3c-1: renderer Coloring submenu (static items).
 * Phase 3c-2: dynamic Paint (Secondary str.) sub-submenu populated from
 *             StyleManager.getStyleNamesJSON via getPaintColoringStyles.
 * Phase 3c-3a: Paint color-picker submenu (color-menu.xul replica) gated
 *              by getRendererPaintInfo.canPaint.
 * Phase 3c-3b: Style (shape) submenu populated from getRendererStyleEntries.
 */
export interface UseSceneContextMenuOptions {
    cm: AsyncCueMol | null
    /** Active scene UID — required to pre-fetch dynamic Paint(SS) styles. */
    sceneId: number | undefined
    toggleVisibility: (id: string) => void
    deleteNode: (id: string) => Promise<boolean>
    renameNode: (id: string, newName: string) => Promise<boolean>
    showProperty: (id: string) => Promise<void> | void
    selectObjectMol: (id: string, kind: SelectMolKind) => Promise<boolean>
    copyNode: (node: SceneTreeNode) => Promise<boolean>
    pasteNode: (node: SceneTreeNode) => Promise<boolean>
    setRendererColoring: (id: string, coloringId: RendColoringId) => Promise<boolean>
    paintRendererSelection: (id: string, colorValue: string) => Promise<boolean>
    paintObjectSelection: (id: string, colorValue: string) => Promise<boolean>
    applyRendererStyle: (
        id: string, styleName: string, pattern: string, flags: string,
    ) => Promise<boolean>
    setSceneBackgroundColor: (color: 'white' | 'black') => Promise<boolean>
    toggleSceneColorProofing: () => Promise<boolean>
    setRendererSelection: (id: string, selKind: ChangeRendSelKind) => Promise<boolean>
    generateRendererSurfObj: (id: string) => Promise<boolean>
    createRendererGroup: (objId: string, name: string) => Promise<boolean>
    changeRendererType: (rendId: string, newType: string) => Promise<boolean>
    createRendererOnObject: (
        targetObjId: number,
        rendOpts: RendererOptions,
        groupName?: string,
    ) => Promise<boolean>
    /** Current multi-select set (Phase 4c). When size > 1 the
     *  right-click on a member triggers the multi context menu. */
    selectedIds?: Set<string>
    bulkSetNodeVisible?: (ids: Iterable<string>, visible: boolean) => Promise<boolean>
    bulkDeleteNodes?: (ids: Iterable<string>) => Promise<boolean>
    /** Phase 5c style ops. */
    createStyleSet: (name: string) => Promise<{ ok: boolean; newId: number }>
    toggleStyleSetReadOnly: (
        nodeId: number, scopeId: number,
    ) => Promise<{ ok: boolean; readonly: boolean }>
    loadStyleSetFromFile: (path: string) => Promise<boolean>
    saveStyleSetToFile: (nodeId: number, scopeId: number, path: string) => Promise<boolean>
    saveStyleSetToCurrentSrc: (
        nodeId: number, scopeId: number,
    ) => Promise<{ ok: boolean; saved: boolean }>
    /** Phase 5b camera ops. */
    activeViewId: number | undefined
    createCamera: (viewId: number, name: string) => Promise<boolean>
    renameCamera: (oldName: string, newName: string) => Promise<boolean>
    saveViewToCamera: (
        viewId: number, name: string, withVisFlags: boolean,
    ) => Promise<boolean>
    applyCameraToView: (
        viewId: number, name: string, withVisFlags: boolean,
    ) => Promise<boolean>
    clearCameraVisFlags: (name: string) => Promise<boolean>
    loadCameraFromFile: (viewId: number, path: string) => Promise<boolean>
    saveCameraToFile: (name: string, path: string) => Promise<boolean>
    saveCameraToCurrentSrc: (
        name: string,
    ) => Promise<{ ok: boolean; saved: boolean }>
    reloadCameraFromSrc: (name: string) => Promise<boolean>
}

export function useSceneContextMenu(opts: UseSceneContextMenuOptions): {
    openContextMenu: (node: SceneTreeNode, x: number, y: number) => Promise<void>
    /**
     * Run the shared "New Renderer..." flow against a given source node
     * (object / renderer / rendGroup). Used by both the ctxmenu item and
     * the toolbar Add button — UXP `onNewCmd` dispatches both paths to
     * the same code, so we expose a single entry point here.
     */
    openNewRendererFlow: (node: SceneTreeNode) => Promise<void>
    /**
     * Run the shared "New Camera..." flow (suggest-name + prompt +
     * `saveViewToCam` worker). Used by both the ctxmenu item and the
     * toolbar Add button when a camera / cameraRoot row is selected,
     * mirroring UXP `onNewCmd` dispatch.
     */
    openNewCameraFlow: () => Promise<void>
} {
    const {
        cm, sceneId, toggleVisibility, deleteNode, renameNode, showProperty,
        selectObjectMol, copyNode, pasteNode, setRendererColoring,
        paintRendererSelection, paintObjectSelection, applyRendererStyle,
        setSceneBackgroundColor, toggleSceneColorProofing,
        setRendererSelection, generateRendererSurfObj,
        createRendererGroup, changeRendererType, createRendererOnObject,
        selectedIds, bulkSetNodeVisible, bulkDeleteNodes,
        createStyleSet, toggleStyleSetReadOnly,
        loadStyleSetFromFile, saveStyleSetToFile, saveStyleSetToCurrentSrc,
        activeViewId,
        createCamera, renameCamera,
        saveViewToCamera, applyCameraToView,
        clearCameraVisFlags,
        loadCameraFromFile, saveCameraToFile, saveCameraToCurrentSrc,
        reloadCameraFromSrc,
    } = opts

    // Electron disables window.prompt — use the in-app Blueprint dialog
    // for Rename / New Group text input flows instead.
    const showTextPrompt = useShowTextPromptDialog()
    const showNewRenderer = useShowNewRendererDialog()
    const showApplyRendStyle = useShowApplyRendStyleDialog()
    const showCreateRendStyle = useShowCreateRendStyleDialog()

    // Shared "New Camera..." flow — also reused by the toolbar Add
    // button. Mirrors UXP `onNewCmd` dispatch (camera / cameraRoot
    // branch). Worker rejects when activeViewId is undefined; we early-
    // return here to skip the dialog noise.
    const openNewCameraFlow = useCallback(
        async (): Promise<void> => {
            if (activeViewId === undefined) return
            if (sceneId === undefined) return
            let suggestion = 'camera_0'
            if (cm) {
                try {
                    const r = await cm.invokeService('proposeUniqName', {
                        kind: 'camera',
                        prefix: 'camera',
                        sceneId,
                    })
                    suggestion = r?.name ?? suggestion
                } catch (err) {
                    console.warn('proposeUniqName failed:', err)
                }
            }
            const entered = await showTextPrompt({
                title: 'New Camera',
                label: 'Name for new camera:',
                defaultValue: suggestion,
                confirmLabel: 'Create',
            })
            if (entered == null) return
            await createCamera(activeViewId, entered)
        },
        [cm, sceneId, activeViewId, showTextPrompt, createCamera],
    )

    // Shared "New Renderer..." flow — also reused by the toolbar Add
    // button. Mirrors UXP `onNewCmd` dispatch, which calls the same
    // `setupRendByObjID` from both the ctxmenu item and the toolbar.
    const openNewRendererFlow = useCallback(
        async (node: SceneTreeNode): Promise<void> => {
            if (
                node.type !== 'object' &&
                node.type !== 'renderer' &&
                node.type !== 'rendGroup'
            ) return
            if (!cm || sceneId === undefined) return
            let info
            try {
                info = await cm.invokeService('getNewRendererOptions', {
                    sceneId,
                    sourceNodeId: node.id,
                    sourceNodeType: node.type,
                })
            } catch (err) {
                console.warn('getNewRendererOptions failed:', err)
                return
            }
            if (!info?.ok || info.rendererTypes.length === 0) return
            const result = await showNewRenderer({
                sceneId,
                objName: info.objName,
                objClassName: info.objClassName,
                rendererTypes: info.rendererTypes,
                defaultName: info.defaultName,
                isMol: info.isMol,
                groupName: info.groupName || undefined,
            })
            if (!result) return
            await createRendererOnObject(
                info.targetObjId,
                result.rendOpts,
                info.groupName || undefined,
            )
        },
        [cm, sceneId, showNewRenderer, createRendererOnObject],
    )

    const openContextMenu = useCallback(
        async (node: SceneTreeNode, x: number, y: number): Promise<void> => {
            // Multi-select right-click: when the targeted node is part of
            // a multi-select set, send the multi payload and short-circuit
            // the per-type pre-fetch — the main process renders the
            // multi-only menu (Show / Hide / Delete).
            const idStr = String(node.id)
            const isMulti =
                !!selectedIds && selectedIds.size > 1 && selectedIds.has(idStr)
            if (isMulti) {
                const multiNodeIds = Array.from(selectedIds!).map((s) => Number(s))
                const action: SceneCtxAction | null = await window.electronAPI.invoke(
                    IPC.SCENE_CTX_SHOW,
                    {
                        x,
                        y,
                        nodeType: node.type,
                        nodeLabel: nodeMenuLabel(node),
                        isVisible: node.visible,
                        hasVisibility: false,
                        clipboardKind: null,
                        multiNodeIds,
                    },
                )
                if (!action) return
                switch (action.kind) {
                    case 'multiShow':
                        if (bulkSetNodeVisible) await bulkSetNodeVisible(selectedIds!, true)
                        break
                    case 'multiHide':
                        if (bulkSetNodeVisible) await bulkSetNodeVisible(selectedIds!, false)
                        break
                    case 'multiDelete':
                        if (bulkDeleteNodes) await bulkDeleteNodes(selectedIds!)
                        break
                }
                return
            }

            const hasVisibility =
                node.type === 'object' ||
                node.type === 'renderer' ||
                node.type === 'rendGroup'

            // Coloring submenu is renderer-only and hidden for the special
            // non-coloring renderer types (selection / label / atomintr).
            const supportsColoring =
                node.type === 'renderer' &&
                !RENDERER_TYPES_WITHOUT_COLORING.has(node.className)

            // Change sel submenu is renderer-only and hidden for `*selection`
            // (matches UXP `onRendCtxtMenuShowing` selitem.hidden gate).
            const supportsChangeSel =
                node.type === 'renderer' && node.className !== '*selection'

            // Generate surface obj is isosurf-only (UXP gensurfitem gate).
            const canGenSurfObj =
                node.type === 'renderer' && node.className === 'isosurf'

            // Pre-fetch clipboard state so main can enable Paste items correctly.
            let clipboardKind: 'object' | 'renderer' | 'style' | 'camera' | null = null
            if (cm) {
                try {
                    const r = await cm.invokeService('getClipboardKind', {})
                    clipboardKind = r?.kind ?? null
                } catch (err) {
                    console.warn('getClipboardKind failed:', err)
                }
            }

            // Pre-fetch renderer-specific submenu data in parallel.
            // Coloring (paint styles + canPaint) is gated by supportsColoring;
            // Style entries are pre-fetched whenever the node is a renderer
            // since the gate (typeStyles/edgeStyles emptiness) is computed
            // worker-side.
            let paintStyles: { name: string; label: string }[] = []
            let canPaint = false
            let rendStyle:
                | {
                    typeStyles: {
                        name: string; label: string; pattern: string; flags: string
                    }[]
                    edgeStyles: {
                        name: string; label: string; pattern: string; flags: string
                    }[]
                }
                | undefined
            let rendChangeTypes: string[] = []
            if (cm && node.type === 'renderer' && sceneId !== undefined) {
                try {
                    const coloringPromises = supportsColoring
                        ? ([
                              cm.invokeService('getPaintColoringStyles', { sceneId }),
                              cm.invokeService('getRendererPaintInfo', {
                                  sceneId, rendId: node.id,
                              }),
                          ] as const)
                        : ([Promise.resolve(null), Promise.resolve(null)] as const)
                    const stylePromise = cm.invokeService('getRendererStyleEntries', {
                        sceneId, rendId: node.id,
                    })
                    const changeTypesPromise = cm.invokeService('getRendererChangeTypes', {
                        sceneId, rendId: node.id,
                    })
                    const [styles, paintInfo, styleEntries, changeTypes] = await Promise.all([
                        coloringPromises[0], coloringPromises[1], stylePromise, changeTypesPromise,
                    ])
                    paintStyles = styles?.entries ?? []
                    canPaint = paintInfo?.canPaint === true
                    if (styleEntries?.ok) {
                        rendStyle = {
                            typeStyles: styleEntries.typeStyles,
                            edgeStyles: styleEntries.edgeStyles,
                        }
                    }
                    rendChangeTypes = changeTypes?.typeNames ?? []
                } catch (err) {
                    console.warn('renderer ctx pre-fetch failed:', err)
                }
            }

            // Object-row paint pre-fetch — drives the Paint color-picker
            // submenu gate (UXP `onPaintMol` object branch, hidden when
            // sel is empty or coloring is not PaintColoring).
            if (cm && node.type === 'object' && sceneId !== undefined) {
                try {
                    const info = await cm.invokeService('getObjectPaintInfo', {
                        sceneId, objId: node.id,
                    })
                    canPaint = info?.canPaint === true
                } catch (err) {
                    console.warn('object paint pre-fetch failed:', err)
                }
            }

            // Pre-fetch scene-row submenu state (bg color + color proofing).
            let bgColor: 'white' | 'black' | 'other' | undefined
            let colorProofingEnabled = false
            if (cm && node.type === 'scene' && sceneId !== undefined) {
                try {
                    const [bg, cp] = await Promise.all([
                        cm.invokeService('getSceneBgColor', { sceneId }),
                        cm.invokeService('getSceneColorProofing', { sceneId }),
                    ])
                    bgColor = bg?.bgColor
                    colorProofingEnabled = cp?.enabled === true
                } catch (err) {
                    console.warn('scene ctx pre-fetch failed:', err)
                }
            }

            // Style + Camera node pre-fetches are just property reads on
            // the tree node — getSceneTree already populated both.
            const styleInfo = node.type === 'style' ? node.styleInfo : undefined
            const cameraInfo = node.type === 'camera' ? node.cameraInfo : undefined

            const action: SceneCtxAction | null = await window.electronAPI.invoke(
                IPC.SCENE_CTX_SHOW,
                {
                    x,
                    y,
                    nodeType: node.type,
                    nodeLabel: nodeMenuLabel(node),
                    isVisible: node.visible,
                    hasVisibility,
                    clipboardKind,
                    supportsColoring,
                    paintStyles,
                    canPaint,
                    rendStyle,
                    bgColor,
                    colorProofingEnabled,
                    supportsChangeSel,
                    canGenSurfObj,
                    rendChangeTypes,
                    styleInfo,
                    cameraInfo,
                },
            )

            if (!action) return

            switch (action.kind) {
                case 'show':
                case 'hide':
                    toggleVisibility(idStr)
                    break
                case 'rename': {
                    const next = await showTextPrompt({
                        title: 'Rename',
                        label: `Rename ${node.name} to:`,
                        defaultValue: node.name,
                    })
                    if (next == null) break
                    if (next === node.name) break
                    if (node.type === 'camera') {
                        // Cameras have no in-place name setter; renameCamera
                        // does the atomic destroy + setCamera dance.
                        await renameCamera(node.name, next)
                    } else {
                        await renameNode(idStr, next)
                    }
                    break
                }
                case 'delete':
                    await deleteNode(idStr)
                    break
                case 'property':
                    await showProperty(idStr)
                    break
                case 'selectMol':
                    if (node.type !== 'object') break
                    await selectObjectMol(idStr, action.selectKind)
                    break
                case 'copy':
                    await copyNode(node)
                    break
                case 'paste':
                    await pasteNode(node)
                    break
                case 'setRendColoring':
                    if (node.type !== 'renderer') break
                    await setRendererColoring(idStr, action.coloringId)
                    break
                case 'paintRend':
                    // UXP `ws.onPaintMol` is shared between the object and
                    // renderer Paint menus — branch on node type.
                    if (node.type === 'object') {
                        await paintObjectSelection(idStr, action.colorValue)
                    } else if (node.type === 'renderer') {
                        await paintRendererSelection(idStr, action.colorValue)
                    }
                    break
                case 'applyRendStyle':
                    if (node.type !== 'renderer') break
                    await applyRendererStyle(
                        idStr, action.styleName, action.pattern, action.flags,
                    )
                    break
                case 'setSceneBgColor':
                    if (node.type !== 'scene') break
                    await setSceneBackgroundColor(action.color)
                    break
                case 'toggleColorProofing':
                    if (node.type !== 'scene') break
                    await toggleSceneColorProofing()
                    break
                case 'setRendSel':
                    if (node.type !== 'renderer') break
                    await setRendererSelection(idStr, action.selKind)
                    break
                case 'generateSurfObj':
                    if (node.type !== 'renderer') break
                    await generateRendererSurfObj(idStr)
                    break
                case 'changeRendType':
                    if (node.type !== 'renderer') break
                    await changeRendererType(idStr, action.typeName)
                    break
                case 'editRendStyle': {
                    if (node.type !== 'renderer') break
                    if (!cm || sceneId === undefined) break
                    let info
                    try {
                        info = await cm.invokeService('getRendererStyleEditInfo', {
                            sceneId, rendId: node.id,
                        })
                    } catch (err) {
                        console.warn('getRendererStyleEditInfo failed:', err)
                        break
                    }
                    if (!info?.ok) break
                    const result = await showApplyRendStyle({
                        rendName: info.rendName,
                        rendTypeName: info.rendTypeName,
                        initialStyles: info.currentStyles,
                        typeMatch: info.typeMatch,
                        edgeMatch: info.edgeMatch,
                        coloringMatch: info.coloringMatch,
                    })
                    if (!result) break
                    try {
                        await cm.invokeService('applyRendererStyleList', {
                            sceneId, rendId: node.id, styleNames: result.styleNames,
                        })
                    } catch (err) {
                        console.warn('applyRendererStyleList failed:', err)
                    }
                    break
                }
                case 'createRendStyle': {
                    if (node.type !== 'renderer') break
                    if (!cm || sceneId === undefined) break
                    let info
                    try {
                        info = await cm.invokeService('getCreateRendStyleInfo', {
                            sceneId, rendId: node.id,
                        })
                    } catch (err) {
                        console.warn('getCreateRendStyleInfo failed:', err)
                        break
                    }
                    if (!info?.ok) break
                    const result = await showCreateRendStyle({
                        rendName: info.rendName,
                        rendTypeName: info.rendTypeName,
                        styleSets: info.styleSets,
                        defaultSelectedUid: info.defaultSelectedUid,
                    })
                    if (!result) break
                    try {
                        await cm.invokeService('createStyleFromRenderer', {
                            sceneId, rendId: node.id,
                            setUid: result.setUid, baseName: result.baseName,
                        })
                    } catch (err) {
                        console.warn('createStyleFromRenderer failed:', err)
                    }
                    break
                }
                case 'newRenderer':
                    await openNewRendererFlow(node)
                    break
                case 'newRendGroup': {
                    if (node.type !== 'object') break
                    // Pre-fetch a scene-wide-unique default name so the
                    // prompt matches UXP `onNewRendGrp` (suggested name
                    // pre-filled, user may accept or edit).
                    let suggestion = 'group1'
                    if (cm && sceneId !== undefined) {
                        try {
                            const r = await cm.invokeService('proposeUniqName', {
                                kind: 'sceneRenderer',
                                prefix: 'group',
                                sceneId,
                            })
                            suggestion = r?.name ?? suggestion
                        } catch (err) {
                            console.warn('proposeUniqName failed:', err)
                        }
                    }
                    const entered = await showTextPrompt({
                        title: 'New Renderer Group',
                        label: 'Name for new group:',
                        defaultValue: suggestion,
                        confirmLabel: 'Create',
                    })
                    if (entered == null) break
                    await createRendererGroup(idStr, entered)
                    break
                }
                case 'newStyle': {
                    if (
                        node.type !== 'style' &&
                        node.type !== 'styleRoot'
                    ) break
                    // UXP `createStyle` walks "style_0", "style_1", ...
                    // until it finds a free name then prompts. We pre-fetch
                    // a unique default via proposeUniqName + show the prompt.
                    let suggestion = 'style_0'
                    if (cm && sceneId !== undefined) {
                        try {
                            const r = await cm.invokeService('proposeUniqName', {
                                kind: 'styleSet',
                                prefix: 'style',
                                sceneId,
                            })
                            suggestion = r?.name ?? suggestion
                        } catch (err) {
                            console.warn('proposeUniqName failed:', err)
                        }
                    }
                    const entered = await showTextPrompt({
                        title: 'New Style',
                        label: 'Name for new style:',
                        defaultValue: suggestion,
                        confirmLabel: 'Create',
                    })
                    if (entered == null) break
                    await createStyleSet(entered)
                    break
                }
                case 'styleToggleReadOnly': {
                    if (node.type !== 'style') break
                    const scope = styleInfo?.scopeId
                    if (scope === undefined) break
                    await toggleStyleSetReadOnly(node.id, scope)
                    break
                }
                case 'styleLoad': {
                    // Path resolution via main-process native file picker.
                    const r = await window.electronAPI.invoke(IPC.DIALOG_STYLE_OPEN)
                    if (r.canceled || !r.filePath) break
                    await loadStyleSetFromFile(r.filePath)
                    break
                }
                case 'styleReload': {
                    // Worker-side equivalent of UXP `onStyReloadFile` —
                    // UXP itself reports "Not implemented" here, so we
                    // mirror that: log + no-op. Kept as a menu entry so
                    // the gating exercise (src.length > 0) is testable.
                    console.info(
                        'styleReload not implemented yet (matches UXP onStyReloadFile)',
                    )
                    break
                }
                case 'styleSave': {
                    if (node.type !== 'style') break
                    const scope = styleInfo?.scopeId
                    if (scope === undefined) break
                    const r = await saveStyleSetToCurrentSrc(node.id, scope)
                    // Empty src: UXP fall-through to Save As.
                    if (r.ok && !r.saved) {
                        const save = await window.electronAPI.invoke(
                            IPC.DIALOG_STYLE_SAVE,
                            { defaultName: node.name === '(anonymous)' ? '' : node.name },
                        )
                        if (save.canceled || !save.filePath) break
                        await saveStyleSetToFile(node.id, scope, save.filePath)
                    }
                    break
                }
                case 'styleSaveAs': {
                    if (node.type !== 'style') break
                    const scope = styleInfo?.scopeId
                    if (scope === undefined) break
                    const save = await window.electronAPI.invoke(
                        IPC.DIALOG_STYLE_SAVE,
                        { defaultName: node.name === '(anonymous)' ? '' : node.name },
                    )
                    if (save.canceled || !save.filePath) break
                    await saveStyleSetToFile(node.id, scope, save.filePath)
                    break
                }
                case 'newCamera': {
                    if (
                        node.type !== 'camera' &&
                        node.type !== 'cameraRoot'
                    ) break
                    await openNewCameraFlow()
                    break
                }
                case 'cameraLoad': {
                    if (activeViewId === undefined) break
                    const r = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_OPEN)
                    if (r.canceled || !r.filePath) break
                    await loadCameraFromFile(activeViewId, r.filePath)
                    break
                }
                case 'cameraReload': {
                    if (node.type !== 'camera') break
                    await reloadCameraFromSrc(node.name)
                    break
                }
                case 'cameraSave': {
                    if (node.type !== 'camera') break
                    const r = await saveCameraToCurrentSrc(node.name)
                    if (r.ok && !r.saved) {
                        // No src — fall through to Save As.
                        const save = await window.electronAPI.invoke(
                            IPC.DIALOG_CAMERA_SAVE,
                            { defaultName: node.name },
                        )
                        if (save.canceled || !save.filePath) break
                        await saveCameraToFile(node.name, save.filePath)
                    }
                    break
                }
                case 'cameraSaveAs': {
                    if (node.type !== 'camera') break
                    const save = await window.electronAPI.invoke(
                        IPC.DIALOG_CAMERA_SAVE,
                        { defaultName: node.name },
                    )
                    if (save.canceled || !save.filePath) break
                    await saveCameraToFile(node.name, save.filePath)
                    break
                }
                case 'cameraSaveFromView': {
                    if (node.type !== 'camera') break
                    if (activeViewId === undefined) break
                    await saveViewToCamera(activeViewId, node.name, action.withVisFlags)
                    break
                }
                case 'cameraApplyToView': {
                    if (node.type !== 'camera') break
                    if (activeViewId === undefined) break
                    await applyCameraToView(activeViewId, node.name, action.withVisFlags)
                    break
                }
                case 'cameraClearVisFlags': {
                    if (node.type !== 'camera') break
                    await clearCameraVisFlags(node.name)
                    break
                }
                case 'cameraEditVisFlags': {
                    // Dialog dep — UXP visflagset-edit-dlg.xul lands in
                    // Phase 6c. Item is disabled in the menu, so this
                    // branch should not normally fire; log to surface
                    // unexpected dispatches in development.
                    console.info('cameraEditVisFlags: deferred to Phase 6c')
                    break
                }
            }
        },
        [
            cm, sceneId, toggleVisibility, deleteNode, renameNode, showProperty,
            selectObjectMol, copyNode, pasteNode, setRendererColoring,
            paintRendererSelection, paintObjectSelection, applyRendererStyle,
            setSceneBackgroundColor, toggleSceneColorProofing,
            setRendererSelection, generateRendererSurfObj,
            createRendererGroup, changeRendererType, createRendererOnObject,
            selectedIds, bulkSetNodeVisible, bulkDeleteNodes,
            createStyleSet, toggleStyleSetReadOnly,
            loadStyleSetFromFile, saveStyleSetToFile, saveStyleSetToCurrentSrc,
            activeViewId,
            createCamera, renameCamera,
            saveViewToCamera, applyCameraToView,
            clearCameraVisFlags,
            loadCameraFromFile, saveCameraToFile, saveCameraToCurrentSrc,
            reloadCameraFromSrc,
            showTextPrompt, showNewRenderer,
            showApplyRendStyle, showCreateRendStyle,
            openNewRendererFlow, openNewCameraFlow,
        ],
    )

    return { openContextMenu, openNewRendererFlow, openNewCameraFlow }
}

function nodeMenuLabel(node: SceneTreeNode): string {
    if (node.type === 'scene') return `Scene: ${node.name || 'Untitled'}`
    if (node.type === 'object') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    if (node.type === 'renderer') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    return node.name
}
