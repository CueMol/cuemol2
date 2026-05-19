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
import { buildSceneCtxPayload, nodeMenuLabel } from './sceneContextMenu/buildSceneCtxPayload'
import { dispatchSceneCtxAction } from './sceneContextMenu/dispatchSceneCtxAction'

/**
 * Opens the native scene-tree context menu and dispatches the returned
 * action against the appropriate worker service via the callbacks supplied
 * by `useSceneTree`. Mirrors the pattern in `useNaviContextMenu`.
 *
 * The hook itself is the React-side wiring: dialog hook resolution, the
 * shared "New Renderer / New Camera" sub-flows, and the orchestrator that
 * runs `buildSceneCtxPayload` -> `IPC.SCENE_CTX_SHOW` ->
 * `dispatchSceneCtxAction`. The pre-fetch and the per-action dispatch
 * live in `./sceneContextMenu/`.
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
    /**
     * Begin inline rename on the row with the given id. Both F2 and the
     * ctxmenu Rename action go through this; the underlying editor lives in
     * `ScenePane` and is controlled by `useSceneTreeController`.
     */
    beginInlineRename: (id: string) => void
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
    /** Current multi-select set. When size > 1 a right-click on a member
     *  triggers the multi context menu. */
    selectedIds?: Set<string>
    bulkSetNodeVisible?: (ids: Iterable<string>, visible: boolean) => Promise<boolean>
    bulkDeleteNodes?: (ids: Iterable<string>) => Promise<boolean>
    /** Style-set ops (create / read-only toggle / file load-save). */
    createStyleSet: (name: string) => Promise<{ ok: boolean; newId: number }>
    toggleStyleSetReadOnly: (
        nodeId: number, scopeId: number,
    ) => Promise<{ ok: boolean; readonly: boolean }>
    loadStyleSetFromFile: (path: string) => Promise<boolean>
    saveStyleSetToFile: (nodeId: number, scopeId: number, path: string) => Promise<boolean>
    saveStyleSetToCurrentSrc: (
        nodeId: number, scopeId: number,
    ) => Promise<{ ok: boolean; saved: boolean }>
    /** Camera ops (create / rename / save-apply / file load-save). */
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
     * the toolbar Add button.
     */
    openNewRendererFlow: (node: SceneTreeNode) => Promise<void>
    /**
     * Run the shared "New Camera..." flow (suggest-name + prompt +
     * `saveViewToCam` worker). Used by both the ctxmenu item and the
     * toolbar Add button when a camera / cameraRoot row is selected.
     */
    openNewCameraFlow: () => Promise<void>
} {
    const { cm, sceneId, activeViewId, createCamera, createRendererOnObject,
            selectedIds, bulkSetNodeVisible, bulkDeleteNodes } = opts

    // Electron disables window.prompt — use the in-app Blueprint dialog
    // for Rename / New Group text input flows instead.
    const showTextPrompt = useShowTextPromptDialog()
    const showNewRenderer = useShowNewRendererDialog()
    const showApplyRendStyle = useShowApplyRendStyleDialog()
    const showCreateRendStyle = useShowCreateRendStyleDialog()

    // Shared "New Camera..." flow — also reused by the toolbar Add button.
    // Mirrors UXP `onNewCmd` dispatch (camera / cameraRoot branch).
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

    // Shared "New Renderer..." flow — also reused by the toolbar Add button.
    // Mirrors UXP `onNewCmd`, which calls the same `setupRendByObjID` from
    // both the ctxmenu item and the toolbar.
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
                molID: info.isMol && info.targetObjId >= 0 ? info.targetObjId : undefined,
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
            const idStr = String(node.id)

            // Multi-select right-click: when the targeted node is part of a
            // multi-select set, send the multi payload and short-circuit the
            // per-type pre-fetch — the main process renders the multi-only
            // menu (Show / Hide / Delete).
            const isMulti =
                !!selectedIds && selectedIds.size > 1 && selectedIds.has(idStr)
            if (isMulti) {
                const multiNodeIds = Array.from(selectedIds!).map((s) => Number(s))
                const multiAction: SceneCtxAction | null = await window.electronAPI.invoke(
                    IPC.SCENE_CTX_SHOW,
                    {
                        x, y,
                        nodeType: node.type,
                        nodeLabel: nodeMenuLabel(node),
                        isVisible: node.visible,
                        hasVisibility: false,
                        clipboardKind: null,
                        multiNodeIds,
                    },
                )
                if (!multiAction) return
                await dispatchSceneCtxAction(node, multiAction, {
                    ...opts,
                    showTextPrompt, showApplyRendStyle, showCreateRendStyle,
                    openNewRendererFlow, openNewCameraFlow,
                })
                return
            }

            const payload = await buildSceneCtxPayload(cm, sceneId, node)
            const action: SceneCtxAction | null = await window.electronAPI.invoke(
                IPC.SCENE_CTX_SHOW,
                { x, y, ...payload },
            )
            if (!action) return
            await dispatchSceneCtxAction(node, action, {
                ...opts,
                showTextPrompt, showApplyRendStyle, showCreateRendStyle,
                openNewRendererFlow, openNewCameraFlow,
            })
        },
        [
            cm, sceneId, opts, selectedIds, bulkSetNodeVisible, bulkDeleteNodes,
            showTextPrompt, showApplyRendStyle, showCreateRendStyle,
            openNewRendererFlow, openNewCameraFlow,
        ],
    )

    return { openContextMenu, openNewRendererFlow, openNewCameraFlow }
}
