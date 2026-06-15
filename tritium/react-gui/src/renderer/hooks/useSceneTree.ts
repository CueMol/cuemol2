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
 *
 * This file is the core hook: it owns the tree fetch, the event
 * subscription, and the selection state. The 40+ action callbacks are
 * grouped by domain into the `sceneTree/` sub-hooks, composed below.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes'
import {
    SEM_SCENE,
    SEM_OBJECT,
    SEM_RENDERER,
    SEM_CAMERA,
    SEM_STYLE,
    SEM_ANY,
} from '../event'
import { useCueMolEventListener } from './useCueMolEventListener'
import { findNode } from './sceneTree/sceneTreeNodeUtils'
import {
    useSceneTreeNodeOps,
    type SceneTreeNodeOps,
} from './sceneTree/useSceneTreeNodeOps'
import {
    useSceneTreeRendererOps,
    type SceneTreeRendererOps,
} from './sceneTree/useSceneTreeRendererOps'
import {
    useSceneTreeCameraOps,
    type SceneTreeCameraOps,
} from './sceneTree/useSceneTreeCameraOps'
import {
    useSceneTreeStyleOps,
    type SceneTreeStyleOps,
} from './sceneTree/useSceneTreeStyleOps'

interface UseSceneTreeOptions {
    cm: AsyncCueMol | null
    /** Active scene UID, or undefined if no scene is active. */
    sceneId: number | undefined
}

/** Whether the current selection supports toolbar focus / delete / property. */
export interface SceneTreeSelectionOps {
    focus: boolean
    delete: boolean
    property: boolean
    add: boolean
}

/** Tree fetch + selection state owned by the core hook. */
export interface SceneTreeCoreState {
    tree: SceneTreeNode | null
    selectedId: string
    /**
     * Multi-select set (Phase 4c). Primary `selectedId` is always present
     * in `selectedIds` when non-empty; Cmd/Shift+click extends the set.
     */
    selectedIds: Set<string>
    /** Returns the resolved node for the current selection, if any. */
    selectedNode: SceneTreeNode | null
    selectedHasOps: SceneTreeSelectionOps
    setSelectedId: (id: string) => void
    /**
     * Cmd/Ctrl+click: toggle membership of `id` in `selectedIds`. If the
     * resulting set is empty the primary `selectedId` is cleared; otherwise
     * the primary becomes `id` (the most-recently-touched).
     */
    toggleInSelection: (id: string) => void
    refetch: () => void
}

export type UseSceneTreeResult = SceneTreeCoreState &
    SceneTreeNodeOps &
    SceneTreeRendererOps &
    SceneTreeCameraOps &
    SceneTreeStyleOps

// Source-type bitmask matching UXP workspace_panel.js: any add/remove/propchg
// on these categories triggers a tree refresh.
const SCENE_EVENT_MASK =
    SEM_SCENE | SEM_OBJECT | SEM_RENDERER | SEM_CAMERA | SEM_STYLE

// Coalesce event bursts (PDB load fires many add/propchg in quick succession).
const REFETCH_DEBOUNCE_MS = 30

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
    useCueMolEventListener({
        cm,
        enabled: sceneId !== undefined,
        category: '',
        srcMask: SCENE_EVENT_MASK,
        evtMask: SEM_ANY,
        scopeId: sceneId ?? -1,
        handler: refetch,
        debounceMs: REFETCH_DEBOUNCE_MS,
    })

    // ── Domain action callbacks ──────────────────────────────────────
    const nodeOps = useSceneTreeNodeOps(cm, sceneIdRef, tree)
    const rendererOps = useSceneTreeRendererOps(cm, sceneIdRef, tree)
    const cameraOps = useSceneTreeCameraOps(cm, sceneIdRef)
    const styleOps = useSceneTreeStyleOps(cm, sceneIdRef)

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
        refetch,
        ...nodeOps,
        ...rendererOps,
        ...cameraOps,
        ...styleOps,
    }
}

/**
 * Decide which toolbar actions are valid for a given selected node.
 * Mirrors UXP `onTreeSelChanged` + `onNewCmd` / `deleteCmdImpl` enablement
 * rules:
 *   - focus: object / renderer / rendGroup
 *   - delete: object / renderer / rendGroup / camera (cameraRoot Delete is
 *     disabled in UXP via `wspcCamCtxt-disable` keyed to elem.type=="camera")
 *   - property: everything except the synthesised cameraRoot / styleRoot
 *   - add: object / renderer / rendGroup → New Renderer;
 *          camera / cameraRoot → New Camera
 *          (style is handled via its own ctxmenu path for now)
 */
function computeOps(node: SceneTreeNode | null): SceneTreeSelectionOps {
    if (!node) return { focus: false, delete: false, property: false, add: false }
    const isRendish =
        node.type === 'object' ||
        node.type === 'renderer' ||
        node.type === 'rendGroup'
    const propertyTarget =
        node.type !== 'cameraRoot' && node.type !== 'styleRoot'
    const canAdd =
        isRendish || node.type === 'camera' || node.type === 'cameraRoot'
    const canDelete = isRendish || node.type === 'camera'
    return {
        focus: isRendish,
        delete: canDelete,
        property: propertyTarget,
        add: canAdd,
    }
}
