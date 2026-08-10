/**
 * @file hooks/sceneContextMenu/dispatchSceneCtxAction.ts
 * @description Maps a SceneCtxAction returned from the main-process menu
 * to the appropriate worker / dialog / IPC call. Extracted from
 * useSceneContextMenu so the switch is independently readable and
 * testable. The hook keeps the React wiring (dialog hooks, useCallback
 * memoisation, openContextMenu orchestration) but delegates the
 * per-action work here.
 */

import type {
    ChangeRendSelKind,
    RendColoringId,
    SceneCtxAction,
    SelectMolKind,
} from '../../../shared/ipcTypes'
import { IPC } from '../../../shared/ipcChannels'
import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { RendererOptions } from '../../components/fopen-opt-dlgs/types'
import type { ApplyRendStyleDialogArgs } from '../../components/dialogs/ApplyRendStyleDialogProvider'
import type { CreateRendStyleDialogArgs } from '../../components/dialogs/CreateRendStyleDialogProvider'
import type { ApplyRendStyleDialogResult } from '../../components/dialogs/ApplyRendStyleDialog'
import type { CreateRendStyleDialogResult } from '../../components/dialogs/CreateRendStyleDialog'
import type { EditCameraVisFlagsDialogArgs } from '../../components/dialogs/EditCameraVisFlagsDialogProvider'
import type { EditCameraVisFlagsDialogResult } from '../../components/dialogs/EditCameraVisFlagsDialog'
import type { EditInteractionListDialogArgs } from '../../components/dialogs/EditInteractionListDialogProvider'
import type { EditInteractionListDialogResult } from '../../components/dialogs/EditInteractionListDialog'
import type { StyleEditorDialogArgs } from '../../components/dialogs/StyleEditorDialogProvider'
import type { RegenMolSurfDialogArgs } from '../../components/dialogs/RegenMolSurfDialogProvider'
import type { RegenMolSurfDialogResult } from '../../components/dialogs/RegenMolSurfDialog'
import { runObjectSaveFlow } from './runObjectSaveFlow'

export interface DispatchSceneCtxActionCtx {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    activeViewId: number | undefined

    // Per-node mutation callbacks (single-target).
    toggleVisibility: (id: string) => void
    deleteNode: (id: string) => Promise<boolean>
    showProperty: (id: string) => Promise<void> | void
    selectObjectMol: (id: string, kind: SelectMolKind) => Promise<boolean>
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

    // Bulk (multi-select) callbacks.
    selectedIds?: Set<string>
    bulkSetNodeVisible?: (ids: Iterable<string>, visible: boolean) => Promise<boolean>
    bulkDeleteNodes?: (ids: Iterable<string>) => Promise<boolean>

    // Style-set callbacks.
    createStyleSet: (name: string) => Promise<{ ok: boolean; newId: number }>
    toggleStyleSetReadOnly: (
        nodeId: number, scopeId: number,
    ) => Promise<{ ok: boolean; readonly: boolean }>
    loadStyleSetFromFile: (path: string) => Promise<boolean>
    saveStyleSetToFile: (nodeId: number, scopeId: number, path: string) => Promise<boolean>
    saveStyleSetToCurrentSrc: (
        nodeId: number, scopeId: number,
    ) => Promise<{ ok: boolean; saved: boolean }>

    // Camera callbacks.
    createCamera: (viewId: number, name: string) => Promise<boolean>
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

    // Dialog hooks (resolved by the parent React hook and passed in).
    showErrorAlert: (args: { title: string; message: string }) => Promise<void>
    showTextPrompt: (opts: {
        title: string
        label: string
        defaultValue?: string
        confirmLabel?: string
    }) => Promise<string | null>
    showApplyRendStyle: (args: ApplyRendStyleDialogArgs) => Promise<ApplyRendStyleDialogResult | null>
    showCreateRendStyle: (args: CreateRendStyleDialogArgs) => Promise<CreateRendStyleDialogResult | null>
    showEditCameraVisFlags: (
        args: EditCameraVisFlagsDialogArgs,
    ) => Promise<EditCameraVisFlagsDialogResult | null>
    showEditInteractionList: (
        args: EditInteractionListDialogArgs,
    ) => Promise<EditInteractionListDialogResult | null>
    showRegenMolSurf: (
        args: RegenMolSurfDialogArgs,
    ) => Promise<RegenMolSurfDialogResult | null>
    showStyleEditor: (args: StyleEditorDialogArgs) => Promise<void>

    // Shared sub-flows reused by toolbar Add button.
    openNewRendererFlow: (node: SceneTreeNode) => Promise<void>
    openNewCameraFlow: () => Promise<void>
}

/**
 * Execute a single `SceneCtxAction` against the supplied callbacks.
 *
 * One `switch` over `action.kind` covering every scene-tree context-menu
 * entry: visibility, rename, delete, clipboard, coloring, style, camera,
 * and bulk multi-select actions. An (action, node type) pair that does not
 * apply returns without effect.
 */
export async function dispatchSceneCtxAction(
    node: SceneTreeNode,
    action: SceneCtxAction,
    ctx: DispatchSceneCtxActionCtx,
): Promise<void> {
    const idStr = String(node.id)
    const styleInfo = node.type === 'style' ? node.styleInfo : undefined

    switch (action.kind) {
        case 'show':
        case 'hide':
            ctx.toggleVisibility(idStr)
            return
        case 'rename':
            // Both ctxmenu and F2 trigger the same inline-rename editor in
            // ScenePane. useSceneTreeController owns the active row id; its
            // commit handler routes to renameCamera vs renameNode.
            ctx.beginInlineRename(idStr)
            return
        case 'delete':
            await ctx.deleteNode(idStr)
            return
        case 'property':
            await ctx.showProperty(idStr)
            return
        case 'selectMol':
            if (node.type !== 'object') return
            await ctx.selectObjectMol(idStr, action.selectKind)
            return
        case 'copy':
            await ctx.copyNode(node)
            return
        case 'paste':
            await ctx.pasteNode(node)
            return
        case 'setRendColoring':
            if (node.type !== 'renderer') return
            await ctx.setRendererColoring(idStr, action.coloringId)
            return
        case 'paintRend':
            // UXP `ws.onPaintMol` is shared between the object and renderer
            // Paint menus -- branch on node type.
            if (node.type === 'object') {
                await ctx.paintObjectSelection(idStr, action.colorValue)
            } else if (node.type === 'renderer') {
                await ctx.paintRendererSelection(idStr, action.colorValue)
            }
            return
        case 'applyRendStyle':
            if (node.type !== 'renderer') return
            await ctx.applyRendererStyle(
                idStr, action.styleName, action.pattern, action.flags,
            )
            return
        case 'setSceneBgColor':
            if (node.type !== 'scene') return
            await ctx.setSceneBackgroundColor(action.color)
            return
        case 'toggleColorProofing':
            if (node.type !== 'scene') return
            await ctx.toggleSceneColorProofing()
            return
        case 'setRendSel':
            if (node.type !== 'renderer') return
            await ctx.setRendererSelection(idStr, action.selKind)
            return
        case 'generateSurfObj':
            if (node.type !== 'renderer') return
            await ctx.generateRendererSurfObj(idStr)
            return
        case 'regenSurface': {
            if (node.type !== 'object') return
            if (!ctx.cm || ctx.sceneId === undefined) return
            // Re-read the origin-molecule state rather than trusting the
            // menu payload: the scene may have changed while the menu was
            // open, and the dialog needs orig_den / orig_prad / orig_sel to
            // prefill anyway.
            const info = await ctx.cm.invokeService('getMolSurfRegenInfo', {
                sceneId: ctx.sceneId,
                objId: node.id,
            })
            if (!info?.canRegen) return
            await ctx.showRegenMolSurf({
                sceneId: ctx.sceneId,
                objId: node.id,
                objName: info.objName,
                origMol: info.origMol,
                selStr: info.selStr,
                density: info.density,
                probeRadius: info.probeRadius,
            })
            return
        }
        case 'changeRendType':
            if (node.type !== 'renderer') return
            await ctx.changeRendererType(idStr, action.typeName)
            return
        case 'editRendStyle': {
            if (node.type !== 'renderer') return
            if (!ctx.cm || ctx.sceneId === undefined) return
            let info: any
            try {
                info = await ctx.cm.invokeService('getRendererStyleEditInfo', {
                    sceneId: ctx.sceneId, rendId: node.id,
                })
            } catch (err) {
                console.warn('getRendererStyleEditInfo failed:', err)
                return
            }
            if (!info?.ok) return
            const result = await ctx.showApplyRendStyle({
                rendName: info.rendName,
                rendTypeName: info.rendTypeName,
                initialStyles: info.currentStyles,
                typeMatch: info.typeMatch,
                edgeMatch: info.edgeMatch,
                coloringMatch: info.coloringMatch,
            })
            if (!result) return
            try {
                await ctx.cm.invokeService('applyRendererStyleList', {
                    sceneId: ctx.sceneId, rendId: node.id, styleNames: result.styleNames,
                })
            } catch (err) {
                console.warn('applyRendererStyleList failed:', err)
            }
            return
        }
        case 'createRendStyle': {
            if (node.type !== 'renderer') return
            if (!ctx.cm || ctx.sceneId === undefined) return
            let info: any
            try {
                info = await ctx.cm.invokeService('getCreateRendStyleInfo', {
                    sceneId: ctx.sceneId, rendId: node.id,
                })
            } catch (err) {
                console.warn('getCreateRendStyleInfo failed:', err)
                return
            }
            if (!info?.ok) return
            const result = await ctx.showCreateRendStyle({
                rendName: info.rendName,
                rendTypeName: info.rendTypeName,
                styleSets: info.styleSets,
                defaultSelectedUid: info.defaultSelectedUid,
            })
            if (!result) return
            try {
                await ctx.cm.invokeService('createStyleFromRenderer', {
                    sceneId: ctx.sceneId, rendId: node.id,
                    setUid: result.setUid, baseName: result.baseName,
                })
            } catch (err) {
                console.warn('createStyleFromRenderer failed:', err)
            }
            return
        }
        case 'editInteractionList': {
            if (node.type !== 'renderer') return
            if (!ctx.cm || ctx.sceneId === undefined) return
            let info
            try {
                info = await ctx.cm.invokeService('listAtomIntrDefs', {
                    sceneId: ctx.sceneId,
                    rendId: node.id,
                })
            } catch (err) {
                console.warn('listAtomIntrDefs failed:', err)
                return
            }
            if (!info?.ok) return
            const result = await ctx.showEditInteractionList({
                rendName: node.name,
                entries: info.entries,
            })
            if (!result || result.removeIds.length === 0) return
            try {
                await ctx.cm.invokeService('removeAtomIntrDefs', {
                    sceneId: ctx.sceneId,
                    rendId: node.id,
                    ids: result.removeIds,
                })
            } catch (err) {
                console.warn('removeAtomIntrDefs failed:', err)
            }
            return
        }
        case 'newRenderer':
            await ctx.openNewRendererFlow(node)
            return
        case 'newRendGroup': {
            if (node.type !== 'object') return
            // Pre-fetch a scene-wide-unique default name so the prompt
            // matches UXP `onNewRendGrp` (suggested name pre-filled).
            let suggestion = 'group1'
            if (ctx.cm && ctx.sceneId !== undefined) {
                try {
                    const r = await ctx.cm.invokeService('proposeUniqName', {
                        kind: 'sceneRenderer',
                        prefix: 'group',
                        sceneId: ctx.sceneId,
                    })
                    suggestion = r?.name ?? suggestion
                } catch (err) {
                    console.warn('proposeUniqName failed:', err)
                }
            }
            const entered = await ctx.showTextPrompt({
                title: 'New Renderer Group',
                label: 'Name for new group:',
                defaultValue: suggestion,
                confirmLabel: 'Create',
            })
            if (entered == null) return
            await ctx.createRendererGroup(idStr, entered)
            return
        }
        case 'saveAsObject': {
            if (node.type !== 'object') return
            if (!ctx.cm || ctx.sceneId === undefined) return
            const res = await runObjectSaveFlow(ctx.cm, ctx.sceneId, node.id)
            if (res.status === 'error') {
                await ctx.showErrorAlert({
                    title: 'Save Object As',
                    message: `Failed to save file: ${res.path}`,
                })
            }
            return
        }
        case 'newStyle': {
            if (node.type !== 'style' && node.type !== 'styleRoot') return
            // UXP `createStyle` walks "style_0", "style_1", ... until it finds
            // a free name then prompts. We pre-fetch a unique default via
            // proposeUniqName + show the prompt.
            let suggestion = 'style_0'
            if (ctx.cm && ctx.sceneId !== undefined) {
                try {
                    const r = await ctx.cm.invokeService('proposeUniqName', {
                        kind: 'styleSet',
                        prefix: 'style',
                        sceneId: ctx.sceneId,
                    })
                    suggestion = r?.name ?? suggestion
                } catch (err) {
                    console.warn('proposeUniqName failed:', err)
                }
            }
            const entered = await ctx.showTextPrompt({
                title: 'New Style',
                label: 'Name for new style:',
                defaultValue: suggestion,
                confirmLabel: 'Create',
            })
            if (entered == null) return
            await ctx.createStyleSet(entered)
            return
        }
        case 'styleToggleReadOnly': {
            if (node.type !== 'style') return
            const scope = styleInfo?.scopeId
            if (scope === undefined) return
            await ctx.toggleStyleSetReadOnly(node.id, scope)
            return
        }
        case 'editStyle': {
            if (node.type !== 'style') return
            if (ctx.sceneId === undefined) return
            await ctx.showStyleEditor({
                styleSetId: node.id,
                scopeId: styleInfo?.scopeId ?? 0,
                sceneId: ctx.sceneId,
                styleName: node.name,
            })
            return
        }
        case 'styleLoad': {
            const r = await window.electronAPI.invoke(IPC.DIALOG_STYLE_OPEN)
            if (r.canceled || !r.filePath) return
            await ctx.loadStyleSetFromFile(r.filePath)
            return
        }
        case 'styleReload': {
            // Worker-side equivalent of UXP `onStyReloadFile` -- UXP itself
            // reports "Not implemented" here, so we mirror that.
            console.info(
                'styleReload not implemented yet (matches UXP onStyReloadFile)',
            )
            return
        }
        case 'styleSave': {
            if (node.type !== 'style') return
            const scope = styleInfo?.scopeId
            if (scope === undefined) return
            const r = await ctx.saveStyleSetToCurrentSrc(node.id, scope)
            // Empty src: UXP fall-through to Save As.
            if (r.ok && !r.saved) {
                const save = await window.electronAPI.invoke(
                    IPC.DIALOG_STYLE_SAVE,
                    { defaultName: node.name === '(anonymous)' ? '' : node.name },
                )
                if (save.canceled || !save.filePath) return
                await ctx.saveStyleSetToFile(node.id, scope, save.filePath)
            }
            return
        }
        case 'styleSaveAs': {
            if (node.type !== 'style') return
            const scope = styleInfo?.scopeId
            if (scope === undefined) return
            const save = await window.electronAPI.invoke(
                IPC.DIALOG_STYLE_SAVE,
                { defaultName: node.name === '(anonymous)' ? '' : node.name },
            )
            if (save.canceled || !save.filePath) return
            await ctx.saveStyleSetToFile(node.id, scope, save.filePath)
            return
        }
        case 'newCamera': {
            if (node.type !== 'camera' && node.type !== 'cameraRoot') return
            await ctx.openNewCameraFlow()
            return
        }
        case 'cameraLoad': {
            if (ctx.activeViewId === undefined) return
            const r = await window.electronAPI.invoke(IPC.DIALOG_CAMERA_OPEN)
            if (r.canceled || !r.filePath) return
            await ctx.loadCameraFromFile(ctx.activeViewId, r.filePath)
            return
        }
        case 'cameraReload': {
            if (node.type !== 'camera') return
            await ctx.reloadCameraFromSrc(node.name)
            return
        }
        case 'cameraSave': {
            if (node.type !== 'camera') return
            const r = await ctx.saveCameraToCurrentSrc(node.name)
            if (r.ok && !r.saved) {
                const save = await window.electronAPI.invoke(
                    IPC.DIALOG_CAMERA_SAVE,
                    { defaultName: node.name },
                )
                if (save.canceled || !save.filePath) return
                await ctx.saveCameraToFile(node.name, save.filePath)
            }
            return
        }
        case 'cameraSaveAs': {
            if (node.type !== 'camera') return
            const save = await window.electronAPI.invoke(
                IPC.DIALOG_CAMERA_SAVE,
                { defaultName: node.name },
            )
            if (save.canceled || !save.filePath) return
            await ctx.saveCameraToFile(node.name, save.filePath)
            return
        }
        case 'cameraSaveFromView': {
            if (node.type !== 'camera') return
            if (ctx.activeViewId === undefined) return
            await ctx.saveViewToCamera(ctx.activeViewId, node.name, action.withVisFlags)
            return
        }
        case 'cameraApplyToView': {
            if (node.type !== 'camera') return
            if (ctx.activeViewId === undefined) return
            await ctx.applyCameraToView(ctx.activeViewId, node.name, action.withVisFlags)
            return
        }
        case 'cameraClearVisFlags': {
            if (node.type !== 'camera') return
            await ctx.clearCameraVisFlags(node.name)
            return
        }
        case 'cameraEditVisFlags': {
            if (node.type !== 'camera') return
            if (!ctx.cm || ctx.sceneId === undefined) return
            let info
            try {
                info = await ctx.cm.invokeService('getCameraVisFlags', {
                    sceneId: ctx.sceneId,
                    cameraName: node.name,
                })
            } catch (err) {
                console.warn('getCameraVisFlags failed:', err)
                return
            }
            if (!info?.ok) return
            const result = await ctx.showEditCameraVisFlags({
                cameraName: node.name,
                entries: info.entries,
            })
            if (!result) return
            try {
                await ctx.cm.invokeService('setCameraVisFlags', {
                    sceneId: ctx.sceneId,
                    cameraName: node.name,
                    entries: result.entries,
                })
            } catch (err) {
                console.warn('setCameraVisFlags failed:', err)
            }
            return
        }
        case 'multiShow':
            if (ctx.bulkSetNodeVisible && ctx.selectedIds) {
                await ctx.bulkSetNodeVisible(ctx.selectedIds, true)
            }
            return
        case 'multiHide':
            if (ctx.bulkSetNodeVisible && ctx.selectedIds) {
                await ctx.bulkSetNodeVisible(ctx.selectedIds, false)
            }
            return
        case 'multiDelete':
            if (ctx.bulkDeleteNodes && ctx.selectedIds) {
                await ctx.bulkDeleteNodes(ctx.selectedIds)
            }
            return
    }
}
