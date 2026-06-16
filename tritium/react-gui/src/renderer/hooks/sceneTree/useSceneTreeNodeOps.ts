/**
 * @file hooks/sceneTree/useSceneTreeNodeOps.ts
 * @description Scene-tree node lifecycle operations for `useSceneTree`:
 * visibility, focus, delete, rename, mol-selection, clipboard, drag-drop
 * reorder, and bulk multi-select ops.
 */

import { useCallback, type MutableRefObject } from 'react'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type {
    SceneNodeType,
    SceneTreeNode,
} from '../../worker/shared/sceneTreeTypes'
import type { SelectMolKind } from '../../../shared/ipcTypes'
import { findNode, findTypedNode } from './sceneTreeNodeUtils'

export interface SceneTreeNodeOps {
    toggleVisibility: (id: string) => void
    /** Focus a node (typically the selection) in the given view. */
    focusNode: (viewId: number, id: string) => Promise<boolean>
    /** Delete a node (typically the selection). */
    deleteNode: (id: string) => Promise<boolean>
    /** Rename a node (object / renderer / rendGroup). */
    renameNode: (id: string, newName: string) => Promise<boolean>
    /** Apply an object-mol selection (e.g. around / by-residue). */
    selectObjectMol: (id: string, kind: SelectMolKind) => Promise<boolean>
    /** Copy a node (object / renderer / rendGroup) to the worker clipboard. */
    copyNode: (node: SceneTreeNode) => Promise<boolean>
    /** Paste from the worker clipboard onto a target node. */
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
    resolveNodeName: (id: string) => string
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
            return res?.ok === true
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
            // the group's parent mol and sets rend.group on attach. Other
            // node types are rejected by the worker.
            let args: {
                sceneId: number
                targetObjId?: number
                targetGroupId?: number
            } = { sceneId: sid }
            if (target.type === 'object') {
                args = { sceneId: sid, targetObjId: target.id }
            } else if (target.type === 'rendGroup') {
                args = { sceneId: sid, targetGroupId: target.id }
            }
            const res = await cm.invokeService('pasteNode', args)
            return res?.ok === true
        },
        [cm, sceneIdRef],
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
            for (const idStr of ids) {
                const found = findTypedNode(
                    tree, idStr, 'object', 'renderer', 'rendGroup',
                )
                if (!found) continue
                const { numId, node } = found
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

    const resolveNodeName = useCallback(
        (id: string): string => {
            const numId = Number(id)
            if (!Number.isFinite(numId)) return id
            const node = findNode(tree, numId)
            return node?.name ?? id
        },
        [tree],
    )

    return {
        toggleVisibility,
        focusNode,
        deleteNode,
        renameNode,
        selectObjectMol,
        copyNode,
        pasteNode,
        moveSceneNode,
        bulkSetNodeVisible,
        bulkDeleteNodes,
        resolveNodeName,
    }
}
