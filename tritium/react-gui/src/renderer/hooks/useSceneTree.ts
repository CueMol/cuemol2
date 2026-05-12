/**
 * @file hooks/useSceneTree.ts
 * @description Live scene-tree state for `ScenePane`.
 *
 * Fetches the tree from the worker via `cm.invokeService('getSceneTree', ...)`
 * and subscribes to the CueMol event manager so the tree refreshes whenever
 * scene contents change (object/renderer/camera/style added, removed, or
 * a watched property — name/visible/locked — is mutated).
 *
 * The listener follows the same shape used by `useLogEvent.ts` and the
 * UXP `workspace_panel.js` reference implementation
 * (`uxp_gui/cuemol2/base/content/workspace_panel.js` `_attachScene`).
 * Events are coalesced through a small debounce so a burst (e.g. PDB load
 * fires many SEM_ADDED / SEM_PROPCHG in quick succession) results in one
 * refetch.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type {
    SceneNodeType,
    SceneTreeNode,
} from '../worker/shared/sceneTreeTypes'
import type { NodeInfoEntry } from '../worker/server/services/sceneOps.service'
import type { ChangeRendSelKind, RendColoringId, SelectMolKind } from '../../shared/ipcTypes'
import {
    SEM_SCENE,
    SEM_OBJECT,
    SEM_RENDERER,
    SEM_CAMERA,
    SEM_STYLE,
    SEM_ANY,
} from '../event'

interface UseSceneTreeOptions {
    cm: AsyncCueMol | null
    /** Active scene UID, or undefined if no scene is active. */
    sceneId: number | undefined
}

export interface NodeInfo {
    title: string
    entries: NodeInfoEntry[]
}

interface UseSceneTreeResult {
    tree: SceneTreeNode | null
    selectedId: string
    /**
     * Multi-select set (Phase 4c). Primary `selectedId` is always present
     * in `selectedIds` when non-empty; Cmd/Shift+click extends the set.
     */
    selectedIds: Set<string>
    /** Returns the resolved node for the current selection, if any. */
    selectedNode: SceneTreeNode | null
    /** Whether the current selection supports toolbar focus / delete / property. */
    selectedHasOps: { focus: boolean; delete: boolean; property: boolean; add: boolean }
    setSelectedId: (id: string) => void
    /**
     * Cmd/Ctrl+click: toggle membership of `id` in `selectedIds`. If the
     * resulting set is empty the primary `selectedId` is cleared; otherwise
     * the primary becomes `id` (the most-recently-touched).
     */
    toggleInSelection: (id: string) => void
    toggleVisibility: (id: string) => void
    /** Focus a node (typically the selection) in the given view. */
    focusNode: (viewId: number, id: string) => Promise<boolean>
    /** Delete a node (typically the selection). */
    deleteNode: (id: string) => Promise<boolean>
    /** Rename a node (object / renderer / rendGroup only in Phase 3a). */
    renameNode: (id: string, newName: string) => Promise<boolean>
    /** Object-mol selection helpers (Phase 3b). */
    selectObjectMol: (id: string, kind: SelectMolKind) => Promise<boolean>
    /** Copy a node (object / renderer / rendGroup) to the worker clipboard. */
    copyNode: (node: SceneTreeNode) => Promise<boolean>
    /** Paste from the worker clipboard onto a target node. */
    pasteNode: (node: SceneTreeNode) => Promise<boolean>
    /** Apply a static coloring submenu choice to a renderer (Phase 3c). */
    setRendererColoring: (id: string, coloringId: RendColoringId) => Promise<boolean>
    /** Insert a paint entry (color + current mol sel) into a PaintColoring renderer. */
    paintRendererSelection: (id: string, colorValue: string) => Promise<boolean>
    /** Apply a Style (shape) submenu choice (Phase 3c-3b). */
    applyRendererStyle: (
        id: string,
        styleName: string,
        pattern: string,
        flags: string,
    ) => Promise<boolean>
    /** Apply a "Change sel" submenu choice to a renderer. */
    setRendererSelection: (id: string, selKind: ChangeRendSelKind) => Promise<boolean>
    /** Generate a MolSurfObj from an isosurf renderer. */
    generateRendererSurfObj: (id: string) => Promise<boolean>
    /**
     * Create an empty `*group` renderer under the given object. The
     * caller passes the user-confirmed name (the renderer side prompts
     * with a worker-suggested default); pass an empty string to let the
     * worker auto-generate `groupN`.
     */
    createRendererGroup: (objId: string, name: string) => Promise<boolean>
    /** Replace a renderer with a new type (Phase 6b). */
    changeRendererType: (rendId: string, newType: string) => Promise<boolean>
    /**
     * Create a new renderer on the given object (Phase 4d).
     * Mirrors UXP `Qm2Main.setupRendByObjID`. Returns true on success;
     * the tree refresh happens via the event listener.
     */
    createRendererOnObject: (
        targetObjId: number,
        rendOpts: import('../components/fopen-opt-dlgs/types').RendererOptions,
        groupName?: string,
    ) => Promise<boolean>
    /**
     * Bulk Show / Hide / Delete on the multi-select set (Phase 4c).
     * Caller passes the set of ids; the hook resolves each to its tree
     * node, filters out non-operable types, and dispatches the worker
     * service inside a single undo txn.
     */
    bulkSetNodeVisible: (ids: Iterable<string>, visible: boolean) => Promise<boolean>
    bulkDeleteNodes: (ids: Iterable<string>) => Promise<boolean>
    /**
     * Drag-drop reorder (Phase 4b). Caller supplies a fully-resolved
     * args object — kind, target/source uids, destObjId/destGroupName
     * for renderers, and orientation. Returns true on success.
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
    /** Set the scene's background color from the scene ctx menu. */
    setSceneBackgroundColor: (color: 'white' | 'black') => Promise<boolean>
    /** Toggle the scene's color-proofing flag. */
    toggleSceneColorProofing: () => Promise<boolean>
    /** Phase 5c style ops. */
    createStyleSet: (name: string) => Promise<{ ok: boolean; newId: number }>
    toggleStyleSetReadOnly: (
        nodeId: number,
        scopeId: number,
    ) => Promise<{ ok: boolean; readonly: boolean }>
    loadStyleSetFromFile: (path: string) => Promise<boolean>
    saveStyleSetToFile: (
        nodeId: number,
        scopeId: number,
        path: string,
    ) => Promise<boolean>
    saveStyleSetToCurrentSrc: (
        nodeId: number,
        scopeId: number,
    ) => Promise<{ ok: boolean; saved: boolean }>
    /** Fetch property info for the property dialog. */
    fetchNodeInfo: (id: string) => Promise<NodeInfo | null>
    refetch: () => void
    resolveNodeName: (id: string) => string
}

// Source-type bitmask matching UXP workspace_panel.js: any add/remove/propchg
// on these categories triggers a tree refresh.
const SCENE_EVENT_MASK =
    SEM_SCENE | SEM_OBJECT | SEM_RENDERER | SEM_CAMERA | SEM_STYLE

// Coalesce event bursts (PDB load fires many add/propchg in quick succession).
const REFETCH_DEBOUNCE_MS = 30

function findNode(root: SceneTreeNode | null, id: number): SceneTreeNode | null {
    if (!root) return null
    if (root.id === id) return root
    for (const child of root.children) {
        const found = findNode(child, id)
        if (found) return found
    }
    return null
}

export function useSceneTree({ cm, sceneId }: UseSceneTreeOptions): UseSceneTreeResult {
    const [tree, setTree] = useState<SceneTreeNode | null>(null)
    const [selectedId, setSelectedIdState] = useState<string>('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

    // Single-select setter: clears the multi-set and replaces with `id`.
    // Empty string means "no selection" (matches existing callers).
    const setSelectedId = useCallback((id: string) => {
        setSelectedIdState(id)
        if (id === '') {
            setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
        } else {
            setSelectedIds(new Set([id]))
        }
    }, [])

    const toggleInSelection = useCallback((id: string) => {
        if (id === '') return
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            // Primary `selectedId` follows the most-recently-touched node
            // when the set is non-empty; clears when emptied.
            if (next.size === 0) {
                setSelectedIdState('')
            } else if (!next.has(selectedId)) {
                setSelectedIdState(id)
            } else {
                setSelectedIdState(id)
            }
            return next
        })
    }, [selectedId])

    // Latest sceneId in a ref so refetch identity stays stable.
    const sceneIdRef = useRef<number | undefined>(sceneId)
    sceneIdRef.current = sceneId

    const refetch = useCallback(() => {
        const sid = sceneIdRef.current
        if (!cm || sid === undefined) {
            setTree(null)
            return
        }
        cm.invokeService('getSceneTree', { sceneId: sid })
            .then((res) => {
                setTree(res?.tree ?? null)
            })
            .catch((err: unknown) => {
                console.warn('getSceneTree failed:', err)
                setTree(null)
            })
    }, [cm])

    // Initial fetch + re-fetch on scene switch.
    useEffect(() => {
        refetch()
    }, [cm, sceneId, refetch])

    // Subscribe to CueMol event manager; debounce a flurry of events into
    // one refetch. Unsubscribe on unmount or when sceneId changes.
    useEffect(() => {
        if (!cm || sceneId === undefined) return

        let timer: ReturnType<typeof setTimeout> | null = null
        let cbid: number | null = null
        let cancelled = false

        const scheduleRefetch = (): void => {
            if (timer !== null) return
            timer = setTimeout(() => {
                timer = null
                refetch()
            }, REFETCH_DEBOUNCE_MS)
        }

        ;(async () => {
            try {
                const id = await cm.addEventListener(
                    '',
                    SCENE_EVENT_MASK,
                    SEM_ANY,
                    sceneId,
                    () => {
                        if (cancelled) return
                        scheduleRefetch()
                    },
                )
                if (cancelled) {
                    cm.removeEventListener(id).catch(() => {})
                    return
                }
                cbid = id
            } catch (err) {
                console.warn('scene event listener failed:', err)
            }
        })()

        return () => {
            cancelled = true
            if (timer !== null) clearTimeout(timer)
            if (cbid !== null) {
                cm.removeEventListener(cbid).catch(() => {})
            }
        }
    }, [cm, sceneId, refetch])

    const toggleVisibility = useCallback(
        (id: string) => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return
            const numId = Number(id)
            if (!Number.isFinite(numId)) return
            const node = findNode(tree, numId)
            if (!node) return
            if (
                node.type !== 'object' &&
                node.type !== 'renderer' &&
                node.type !== 'rendGroup'
            ) {
                return
            }
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
        [cm, tree],
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

    const focusNode = useCallback(
        async (viewId: number, id: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node) return false
            const res = await cm.invokeService('focusOnNode', {
                sceneId: sid,
                viewId,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const deleteNode = useCallback(
        async (id: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node) return false
            const childIds =
                node.type === 'rendGroup'
                    ? node.children.map((c) => c.id).filter((n) => n >= 0)
                    : undefined
            // Style nodes require the scope id so the worker can call
            // StyleManager.destroyStyleSet(scopeId, styleSetId).
            const scopeId =
                node.type === 'style' ? node.styleInfo?.scopeId : undefined
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
        [cm, tree],
    )

    const renameNode = useCallback(
        async (id: string, newName: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node) return false
            const res = await cm.invokeService('renameNode', {
                sceneId: sid,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
                newName,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const selectObjectMol = useCallback(
        async (id: string, kind: SelectMolKind): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'object') return false
            const res = await cm.invokeService('selectObjectMol', {
                sceneId: sid,
                objId: numId,
                kind,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const copyNode = useCallback(
        async (node: SceneTreeNode): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            if (
                node.type !== 'object' &&
                node.type !== 'renderer' &&
                node.type !== 'rendGroup' &&
                node.type !== 'style'
            ) {
                return false
            }
            const scopeId =
                node.type === 'style' ? node.styleInfo?.scopeId : undefined
            const res = await cm.invokeService('copyNode', {
                sceneId: sid,
                nodeId: node.id,
                nodeType: node.type,
                scopeId,
            })
            return res?.ok === true
        },
        [cm],
    )

    const pasteNode = useCallback(
        async (target: SceneTreeNode): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            // Scene row accepts object pastes (no target id). Object row
            // accepts renderer pastes via targetObjId. RendGroup row
            // accepts renderer pastes via targetGroupId — worker resolves
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
        [cm],
    )

    const setRendererColoring = useCallback(
        async (id: string, coloringId: RendColoringId): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'renderer') return false
            const res = await cm.invokeService('setRendererColoring', {
                sceneId: sid,
                rendId: numId,
                coloringId,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const paintRendererSelection = useCallback(
        async (id: string, colorValue: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'renderer') return false
            const res = await cm.invokeService('paintRendererSelection', {
                sceneId: sid,
                rendId: numId,
                colorValue,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const applyRendererStyle = useCallback(
        async (
            id: string,
            styleName: string,
            pattern: string,
            flags: string,
        ): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'renderer') return false
            const res = await cm.invokeService('applyRendererStyle', {
                sceneId: sid,
                rendId: numId,
                styleName,
                pattern,
                flags,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const setRendererSelection = useCallback(
        async (id: string, selKind: ChangeRendSelKind): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'renderer') return false
            const res = await cm.invokeService('setRendererSelection', {
                sceneId: sid,
                rendId: numId,
                selKind,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const generateRendererSurfObj = useCallback(
        async (id: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(id)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'renderer') return false
            const res = await cm.invokeService('generateRendererSurfObj', {
                sceneId: sid,
                rendId: numId,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const createRendererGroup = useCallback(
        async (objId: string, name: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(objId)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'object') return false
            const res = await cm.invokeService('createRendererGroup', {
                sceneId: sid,
                objId: numId,
                name,
            })
            return res?.ok === true
        },
        [cm, tree],
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
        [cm],
    )

    const changeRendererType = useCallback(
        async (rendId: string, newType: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const numId = Number(rendId)
            if (!Number.isFinite(numId)) return false
            const node = findNode(tree, numId)
            if (!node || node.type !== 'renderer') return false
            const res = await cm.invokeService('changeRendererType', {
                sceneId: sid,
                rendId: numId,
                newType,
            })
            return res?.ok === true
        },
        [cm, tree],
    )

    const createRendererOnObject = useCallback(
        async (
            targetObjId: number,
            rendOpts: import('../components/fopen-opt-dlgs/types').RendererOptions,
            groupName?: string,
        ): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('createRendererOnObject', {
                sceneId: sid,
                objId: targetObjId,
                rendOpts,
                groupName,
            })
            return res?.ok === true
        },
        [cm],
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
                const num = Number(idStr)
                if (!Number.isFinite(num)) continue
                const node = findNode(tree, num)
                if (!node) continue
                if (
                    node.type !== 'object' &&
                    node.type !== 'renderer' &&
                    node.type !== 'rendGroup'
                ) continue
                const childIds = node.type === 'rendGroup'
                    ? node.children.map((c) => c.id).filter((n) => n >= 0)
                    : undefined
                out.push({ nodeId: num, nodeType: node.type, childIds })
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
        [cm, resolveBulkItems],
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
        [cm, resolveBulkItems],
    )

    const setSceneBackgroundColor = useCallback(
        async (color: 'white' | 'black'): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('setSceneBgColor', {
                sceneId: sid,
                colorName: color,
            })
            return res?.ok === true
        },
        [cm],
    )

    const toggleSceneColorProofing = useCallback(
        async (): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('toggleSceneColorProofing', {
                sceneId: sid,
            })
            return res?.ok === true
        },
        [cm],
    )

    const createStyleSet = useCallback(
        async (name: string): Promise<{ ok: boolean; newId: number }> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false, newId: -1 }
            const res = await cm.invokeService('createStyleSet', {
                sceneId: sid, name,
            })
            return { ok: res?.ok === true, newId: res?.newId ?? -1 }
        },
        [cm],
    )

    const toggleStyleSetReadOnly = useCallback(
        async (nodeId: number, scopeId: number): Promise<{ ok: boolean; readonly: boolean }> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false, readonly: false }
            const res = await cm.invokeService('toggleStyleSetReadOnly', {
                sceneId: sid, scopeId, styleSetId: nodeId,
            })
            return { ok: res?.ok === true, readonly: res?.readonly === true }
        },
        [cm],
    )

    const loadStyleSetFromFile = useCallback(
        async (path: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('loadStyleSetFromFile', {
                sceneId: sid, path,
            })
            return res?.ok === true
        },
        [cm],
    )

    const saveStyleSetToFile = useCallback(
        async (nodeId: number, scopeId: number, path: string): Promise<boolean> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return false
            const res = await cm.invokeService('saveStyleSetToFile', {
                sceneId: sid, scopeId, styleSetId: nodeId, path,
            })
            return res?.ok === true
        },
        [cm],
    )

    const saveStyleSetToCurrentSrc = useCallback(
        async (nodeId: number, scopeId: number): Promise<{ ok: boolean; saved: boolean }> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return { ok: false, saved: false }
            const res = await cm.invokeService('saveStyleSetToCurrentSrc', {
                sceneId: sid, scopeId, styleSetId: nodeId,
            })
            return { ok: res?.ok === true, saved: res?.saved === true }
        },
        [cm],
    )

    const fetchNodeInfo = useCallback(
        async (id: string): Promise<NodeInfo | null> => {
            const sid = sceneIdRef.current
            if (!cm || sid === undefined) return null
            const numId = Number(id)
            if (!Number.isFinite(numId)) return null
            const node = findNode(tree, numId)
            if (!node) return null
            const res = await cm.invokeService('getNodeInfo', {
                sceneId: sid,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
            })
            if (!res?.ok) return null
            return {
                title: res.displayName || node.name || 'Properties',
                entries: res.entries,
            }
        },
        [cm, tree],
    )

    const selectedNode = selectedId
        ? findNode(tree, Number(selectedId))
        : null

    // Multi-select gates focus/property to single selection only; delete
    // stays enabled (mirrors UXP toolbar behaviour where the multi
    // ctxmenu still offers Delete).
    const isMulti = selectedIds.size > 1
    const singleOps = computeOps(selectedNode)
    const selectedHasOps = isMulti
        ? { focus: false, delete: singleOps.delete, property: false, add: false }
        : singleOps

    return {
        tree,
        selectedId,
        selectedIds,
        selectedNode,
        selectedHasOps,
        setSelectedId,
        toggleInSelection,
        toggleVisibility,
        focusNode,
        deleteNode,
        renameNode,
        selectObjectMol,
        copyNode,
        pasteNode,
        setRendererColoring,
        paintRendererSelection,
        applyRendererStyle,
        setRendererSelection,
        generateRendererSurfObj,
        createRendererGroup,
        changeRendererType,
        createRendererOnObject,
        bulkSetNodeVisible,
        bulkDeleteNodes,
        moveSceneNode,
        setSceneBackgroundColor,
        toggleSceneColorProofing,
        createStyleSet,
        toggleStyleSetReadOnly,
        loadStyleSetFromFile,
        saveStyleSetToFile,
        saveStyleSetToCurrentSrc,
        fetchNodeInfo,
        refetch,
        resolveNodeName,
    }
}

/**
 * Decide which toolbar actions are valid for a given selected node.
 * Mirrors UXP `onTreeSelChanged` enablement rules: focus and delete are
 * valid for object / renderer / rendGroup; property is valid for everything
 * except the synthesised cameraRoot / styleRoot containers.
 */
function computeOps(
    node: SceneTreeNode | null,
): { focus: boolean; delete: boolean; property: boolean; add: boolean } {
    if (!node) return { focus: false, delete: false, property: false, add: false }
    const mutable =
        node.type === 'object' ||
        node.type === 'renderer' ||
        node.type === 'rendGroup'
    const propertyTarget =
        node.type !== 'cameraRoot' && node.type !== 'styleRoot'
    // UXP `onNewCmd` accepts object / renderer / rendGroup rows for the
    // Add toolbar; camera/style branches go through their own paths
    // (Phase 5b/5c) so we gate them out here.
    return {
        focus: mutable,
        delete: mutable,
        property: propertyTarget,
        add: mutable,
    }
}
