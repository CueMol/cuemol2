/**
 * @file hooks/sceneTree/useSceneTreeNodeOps.ts
 * @description Scene-tree node lifecycle operations for `useSceneTree`:
 * visibility, focus, delete, rename, mol-selection, clipboard, drag-drop
 * reorder, and bulk multi-select ops.
 */

import { useCallback, type MutableRefObject, useMemo} from 'react'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type {
    SceneNodeType,
    SceneTreeNode,
} from '../../worker/shared/sceneTreeTypes'
import type { SelectMolKind } from '@shared/types/sceneCtxMenu'
import { IPC } from '@shared/ipcChannels'
import { findNode, findParentNode, findTypedNode } from './sceneTreeNodeUtils'

/** What a copy service returns for the caller to put on the clipboard. */
interface SceneClipPayload {
    ok: boolean
    kind: 'object' | 'renderer' | 'style' | 'camera' | null
    form?: 'single' | 'rendArray'
    name?: string
    bytes?: Uint8Array
}

/**
 * Hand a freshly serialized node to the main process, which owns the OS
 * clipboard. Copy is only "done" once the payload is actually on the
 * clipboard, so a failed write reports failure rather than leaving the user
 * with a Paste that silently does the wrong thing.
 */
async function writeSceneClip(res: SceneClipPayload | undefined): Promise<boolean> {
    if (res?.ok !== true || !res.kind || !res.bytes) return false
    const api = window.electronAPI
    if (!api) return false
    try {
        const w = await api.invoke(IPC.CLIPBOARD_CUEMOL_WRITE, {
            kind: res.kind,
            form: res.form,
            name: res.name,
            bytes: res.bytes,
        })
        return w?.ok === true
    } catch (err) {
        console.warn('clipboard write failed:', err)
        return false
    }
}

/**
 * Pull a scene-node payload off the OS clipboard. Paint rows live on the
 * same clipboard but are not a scene node, so they are refused here.
 */
async function readSceneClip(): Promise<
    { kind: 'object' | 'renderer' | 'style' | 'camera'; form: 'single' | 'rendArray'; name: string; bytes: Uint8Array } | null
> {
    const api = window.electronAPI
    if (!api) return null
    try {
        const clip = await api.invoke(IPC.CLIPBOARD_CUEMOL_READ)
        if (!clip || clip.kind === 'paint') return null
        return clip
    } catch (err) {
        console.warn('clipboard read failed:', err)
        return null
    }
}

export interface SceneTreeNodeOps {
    toggleVisibility: (id: string) => void
    /**
     * Persist a row's expand/collapse state into C++ `ui_collapsed`
     * (object / rendGroup rows only; fire-and-forget, no undo txn).
     */
    setNodeUiCollapsed: (id: string, collapsed: boolean) => void
    /** Focus a node (typically the selection) in the given view. */
    focusNode: (viewId: number, id: string) => Promise<boolean>
    /** Delete a node (typically the selection). */
    deleteNode: (id: string) => Promise<boolean>
    /** Rename a node (object / renderer / rendGroup). */
    renameNode: (id: string, newName: string) => Promise<boolean>
    /** Apply an object-mol selection (e.g. around / by-residue). */
    selectObjectMol: (id: string, kind: SelectMolKind) => Promise<boolean>
    /** Copy a node (object / renderer / rendGroup) to the OS clipboard. */
    copyNode: (node: SceneTreeNode) => Promise<boolean>
    /** Paste whatever scene node is on the OS clipboard onto a target node. */
    pasteNode: (node: SceneTreeNode) => Promise<boolean>
    /**
     * Drag-drop reorder. Caller supplies a fully-resolved args object:
     * kind, target/source uids, destObjId/destGroupName for renderers,
     * and orientation. Returns true on success.
     */
    moveSceneNode: (
        args:
            | { kind: 'object'; sourceId: number; targetId: number; ori: -1 | 1 }
            | {
                kind: 'renderer'
                sourceId: number
                destObjId: number
                destGroupName: string
                targetId: number
                ori: -1 | 0 | 1
            },
    ) => Promise<boolean>
    /**
     * Bulk Show / Hide / Delete on the multi-select set. Caller passes the
     * set of ids; the hook resolves each to its tree node, filters out
     * non-operable types, and dispatches the worker service inside a single
     * undo txn.
     */
    bulkSetNodeVisible: (ids: Iterable<string>, visible: boolean) => Promise<boolean>
    bulkDeleteNodes: (ids: Iterable<string>) => Promise<boolean>
    /** UXP `onMultiCopy`; `reason` carries its refusal cases. */
    bulkCopyNodes: (ids: Iterable<string>) => Promise<BulkCopyResult>
    resolveNodeName: (id: string) => string
}

/** Outcome of a multi-selection copy. */
export interface BulkCopyResult {
    ok: boolean
    /** 'mixed' or 'objectUnsupported' when the worker declined. */
    reason?: 'mixed' | 'objectUnsupported'
}

export function useSceneTreeNodeOps(
    cm: AsyncCueMol | null,
    sceneIdRef: MutableRefObject<number | undefined>,
    tree: SceneTreeNode | null,
): SceneTreeNodeOps {
    const toggleVisibility = useCallback(
        (id: string) => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return
            const found = findTypedNode(tree, id, 'object', 'renderer', 'rendGroup')
            if (!found) return
            const { numId, node } = found
            cm.invokeService('setNodeVisible', {
                sceneId: sid,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
                visible: !node.visible,
            }).catch((err: unknown) => {
                console.warn('setNodeVisible failed:', err)
            })
            // Event subscription will trigger refetch automatically.
        },
        [cm, sceneIdRef, tree],
    )

    const setNodeUiCollapsed = useCallback(
        (id: string, collapsed: boolean) => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return
            // Only real C++ nodes persist collapse state; synthesised rows
            // (cameraRoot / styleRoot) are excluded by the type filter.
            const found = findTypedNode(tree, id, 'object', 'rendGroup')
            if (!found || found.numId < 0) return
            cm.invokeService('setNodeUiCollapsed', {
                sceneId: sid,
                nodeId: found.numId,
                nodeType: found.node.type as 'object' | 'rendGroup',
                collapsed,
            }).catch((err: unknown) => {
                console.warn('setNodeUiCollapsed failed:', err)
            })
        },
        [cm, sceneIdRef, tree],
    )

    const focusNode = useCallback(
        async (viewId: number, id: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id)
            if (!found) return false
            const { numId, node } = found
            const res = await cm.invokeService('focusOnNode', {
                sceneId: sid,
                viewId,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const deleteNode = useCallback(
        async (id: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id)
            if (!found) return false
            const { numId, node } = found
            const childIds =
                node.type === 'rendGroup'
                    ? node.children.map((c) => c.id).filter((n) => n >= 0)
                    : undefined
            // Style nodes require the scope id so the worker can call
            // StyleManager.destroyStyleSet(scopeId, styleSetId).
            const scopeId =
                node.type === 'style' ? node.styleInfo?.scopeId : undefined
            // Camera nodes are keyed by name; deleteNode for cameras
            // routes through the dedicated `destroyCamera` worker service.
            if (node.type === 'camera') {
                const res = await cm.invokeService('destroyCamera', {
                    sceneId: sid, name: node.name,
                })
                return res?.ok === true
            }
            const res = await cm.invokeService('deleteNode', {
                sceneId: sid,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
                childIds,
                scopeId,
            })
            // Event subscription handles refetch on success.
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const renameNode = useCallback(
        async (id: string, newName: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id)
            if (!found) return false
            const { numId, node } = found
            const res = await cm.invokeService('renameNode', {
                sceneId: sid,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
                newName,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const selectObjectMol = useCallback(
        async (id: string, kind: SelectMolKind): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const found = findTypedNode(tree, id, 'object')
            if (!found) return false
            const res = await cm.invokeService('selectObjectMol', {
                sceneId: sid,
                objId: found.numId,
                kind,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const copyNode = useCallback(
        async (node: SceneTreeNode): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            if (
                node.type !== 'object' &&
                node.type !== 'renderer' &&
                node.type !== 'rendGroup' &&
                node.type !== 'style' &&
                node.type !== 'camera'
            ) {
                return false
            }
            const scopeId =
                node.type === 'style' ? node.styleInfo?.scopeId : undefined
            const cameraName = node.type === 'camera' ? node.name : undefined
            const res = await cm.invokeService('copyNode', {
                sceneId: sid,
                nodeId: node.id,
                nodeType: node.type,
                scopeId,
                cameraName,
            })
            return writeSceneClip(res)
        },
        [cm, sceneIdRef],
    )

    const pasteNode = useCallback(
        async (target: SceneTreeNode): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            // Scene row accepts object pastes (no target id). Object row
            // accepts renderer pastes via targetObjId. RendGroup row
            // accepts renderer pastes via targetGroupId -- worker resolves
            // the group's parent mol and sets rend.group on attach.
            //
            // A renderer row pastes as its SIBLING: the destination is
            // whatever it hangs off, so a copied renderer lands beside the
            // one that was right-clicked (inside the same group when there is
            // one). Without this a renderer row was silently no-target and
            // Paste did nothing.
            let args: {
                sceneId: number
                targetObjId?: number
                targetGroupId?: number
            } = { sceneId: sid }
            if (target.type === 'object') {
                args = { sceneId: sid, targetObjId: target.id }
            } else if (target.type === 'rendGroup') {
                args = { sceneId: sid, targetGroupId: target.id }
            } else if (target.type === 'renderer') {
                const parent = findParentNode(tree, target.id)
                if (parent?.type === 'rendGroup') {
                    args = { sceneId: sid, targetGroupId: parent.id }
                } else if (parent?.type === 'object') {
                    args = { sceneId: sid, targetObjId: parent.id }
                }
            }
            const clip = await readSceneClip()
            if (!clip) return false
            const res = await cm.invokeService('pasteNode', { ...args, ...clip })
            return res?.ok === true
        },
        [cm, sceneIdRef, tree],
    )

    const moveSceneNode = useCallback(
        async (
            args:
                | { kind: 'object'; sourceId: number; targetId: number; ori: -1 | 1 }
                | {
                    kind: 'renderer'
                    sourceId: number
                    destObjId: number
                    destGroupName: string
                    targetId: number
                    ori: -1 | 0 | 1
                },
        ): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('reorderSceneNode', {
                ...args,
                sceneId: sid,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef],
    )

    /**
     * Map selected row ids to bulk-service items.
     *
     * Rows a bulk op cannot act on (camera / style / the synthesised roots)
     * are dropped, matching the worker's own `isOperable` filter.
     *
     * A selected group already carries its members in `childIds`, so a member
     * selected alongside its group would be visited twice -- harmless for
     * Show/Hide but a delete of an already-freed uid the second time. Drop any
     * row that a selected `rendGroup` ancestor will handle, so each node is
     * touched exactly once.
     */
    const resolveBulkItems = useCallback(
        (ids: Iterable<string>): {
            nodeId: number
            nodeType: SceneNodeType
            childIds?: number[]
        }[] => {
            const out: {
                nodeId: number
                nodeType: SceneNodeType
                childIds?: number[]
            }[] = []
            const idList = [...ids]
            // uids covered by a selected group, collected before the walk so
            // the group may appear after its members in the selection order.
            const coveredByGroup = new Set<number>()
            for (const idStr of idList) {
                const found = findTypedNode(tree, idStr, 'rendGroup')
                if (!found) continue
                for (const c of found.node.children) {
                    if (c.id >= 0) coveredByGroup.add(c.id)
                }
            }
            for (const idStr of idList) {
                const found = findTypedNode(
                    tree, idStr, 'object', 'renderer', 'rendGroup',
                )
                if (!found) continue
                const { numId, node } = found
                if (coveredByGroup.has(numId)) continue
                const childIds = node.type === 'rendGroup'
                    ? node.children.map((c) => c.id).filter((n) => n >= 0)
                    : undefined
                out.push({ nodeId: numId, nodeType: node.type, childIds })
            }
            return out
        },
        [tree],
    )

    const bulkSetNodeVisible = useCallback(
        async (ids: Iterable<string>, visible: boolean): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const items = resolveBulkItems(ids)
            if (items.length === 0) return false
            const res = await cm.invokeService('bulkSetNodeVisible', {
                sceneId: sid, items, visible,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, resolveBulkItems],
    )

    const bulkDeleteNodes = useCallback(
        async (ids: Iterable<string>): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const items = resolveBulkItems(ids)
            if (items.length === 0) return false
            const res = await cm.invokeService('bulkDeleteNode', {
                sceneId: sid, items,
            })
            return res?.ok === true
        },
        [cm, sceneIdRef, resolveBulkItems],
    )


    /**
     * Copy a multi-selection to the clipboard (UXP `onMultiCopy`).
     *
     * Resolves the same way the other bulk ops do, then hands the worker
     * the ids with their types so it can apply UXP's two refusals (mixed
     * kinds, multiple objects). Returns the worker's reason so the caller
     * can surface UXP's alert text.
     */
    const bulkCopyNodes = useCallback(
        async (ids: Iterable<string>): Promise<BulkCopyResult> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false }
            const items = resolveBulkItems(ids)
            if (items.length === 0) return { ok: false }
            const res = await cm.invokeService('copyNodes', {
                sceneId: sid,
                nodeIds: items.map((i) => i.nodeId),
                nodeTypes: items.map((i) => i.nodeType),
            })
            if (res?.ok !== true) {
                // 'nodeTypesMismatch' is a caller bug, not a user-facing case.
                const reason = res?.reason
                return {
                    ok: false,
                    reason: reason === 'nodeTypesMismatch' ? undefined : reason,
                }
            }
            return { ok: await writeSceneClip(res) }
        },
        [cm, sceneIdRef, resolveBulkItems],
    )

    const resolveNodeName = useCallback(
        (id: string): string => {
            const numId = Number(id)
            if (!Number.isFinite(numId)) return id
            const node = findNode(tree, numId)
            return node?.name ?? id
        },
        [tree],
    )

    /**
     * Scene-tree node operations, memoized: `useSceneTree` spreads this into
     * the bundle its provider hands out as context, so a fresh object here
     * would re-render every row on any render.
     */
    return useMemo(
        () => ({
            toggleVisibility,
            setNodeUiCollapsed,
            focusNode,
            deleteNode,
            renameNode,
            selectObjectMol,
            copyNode,
            pasteNode,
            moveSceneNode,
            bulkSetNodeVisible,
            bulkDeleteNodes,
            bulkCopyNodes,
            resolveNodeName,
        }),
        [
        toggleVisibility, setNodeUiCollapsed, focusNode, deleteNode, renameNode,
        selectObjectMol, copyNode, pasteNode, moveSceneNode, bulkSetNodeVisible,
        bulkDeleteNodes, bulkCopyNodes, resolveNodeName,
        ],
    )
}
