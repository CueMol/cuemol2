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
    /** Returns the resolved node for the current selection, if any. */
    selectedNode: SceneTreeNode | null
    /** Whether the current selection supports toolbar focus / delete / property. */
    selectedHasOps: { focus: boolean; delete: boolean; property: boolean }
    setSelectedId: (id: string) => void
    toggleVisibility: (id: string) => void
    /** Focus a node (typically the selection) in the given view. */
    focusNode: (viewId: number, id: string) => Promise<boolean>
    /** Delete a node (typically the selection). */
    deleteNode: (id: string) => Promise<boolean>
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
    const [selectedId, setSelectedId] = useState<string>('')

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
            const res = await cm.invokeService('deleteNode', {
                sceneId: sid,
                nodeId: numId,
                nodeType: node.type as SceneNodeType,
                childIds,
            })
            // Event subscription handles refetch on success.
            return res?.ok === true
        },
        [cm, tree],
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

    const selectedHasOps = computeOps(selectedNode)

    return {
        tree,
        selectedId,
        selectedNode,
        selectedHasOps,
        setSelectedId,
        toggleVisibility,
        focusNode,
        deleteNode,
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
): { focus: boolean; delete: boolean; property: boolean } {
    if (!node) return { focus: false, delete: false, property: false }
    const mutable =
        node.type === 'object' ||
        node.type === 'renderer' ||
        node.type === 'rendGroup'
    const propertyTarget =
        node.type !== 'cameraRoot' && node.type !== 'styleRoot'
    return {
        focus: mutable,
        delete: mutable,
        property: propertyTarget,
    }
}
