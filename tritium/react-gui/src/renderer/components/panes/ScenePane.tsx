/**
 * @file ScenePane.tsx
 * @description Hierarchical scene tree pane mirroring the UXP
 * `panel.workspace` layout.
 *
 * Tree layout (matches UXP `syncContents`):
 *   "Scene: <name>"               ← scene row (no children — leaf)
 *   object1 (PDBMol)              ← object branches
 *     └─ renderer1 (cartoon)
 *   object2 (...)
 *   Camera                        ← cameraRoot (children = saved cameras)
 *   Styles                        ← styleRoot (children = registered styles)
 *
 * Scene, objects, cameraRoot and styleRoot are all top-level siblings; the
 * scene row itself does not nest the objects beneath it. This matches the
 * UXP `object_name: "noindent"` flag on the scene row.
 *
 * @module ScenePane
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
    Icon,
    InputGroup,
    Tree,
    Button,
    ButtonGroup,
    Tooltip,
    type IconName,
    type TreeNodeInfo,
} from "@blueprintjs/core";

import type { SceneNodeType, SceneTreeNode } from "../../worker/shared/sceneTreeTypes";

/* ─── Drag-drop reorder (Phase 4b) ─── */

/** Mime type for the JSON payload carried during scene-tree DnD. */
const SCENE_NODE_MIME = "application/x-scene-node";

/** Source info written to dataTransfer on dragstart. */
interface DragSourcePayload {
    id: number;
    type: SceneNodeType;
}

/** Orientation of a drop relative to the target row. */
type DragOri = -1 | 0 | 1;

/** Computed move-intent passed to the worker after a drop. */
export type MoveSceneNodeArgs =
    | { kind: "object"; sourceId: number; targetId: number; ori: -1 | 1 }
    | {
        kind: "renderer";
        sourceId: number;
        destObjId: number;
        destGroupName: string;
        targetId: number;
        ori: -1 | 0 | 1;
    };

/**
 * Decide whether a (source, target, ori) combo represents a valid drop.
 * Mirrors UXP `workspace_panel_dnd.js` `canDrop` (subset — multi-select
 * deferred). Caller passes both nodes plus an `ori`.
 *
 * Returns the resolved `MoveSceneNodeArgs` on accept, or null on reject.
 * The parentLookup gives the parent node for any tree id (returns the
 * scene node for top-level objects, or the parent rendGroup / object
 * for nested renderers).
 */
function planSceneNodeMove(
    src: SceneTreeNode,
    tgt: SceneTreeNode,
    ori: DragOri,
    parentLookup: (id: number) => SceneTreeNode | null,
): MoveSceneNodeArgs | null {
    if (src.id === tgt.id) return null;

    // Object → object reorder.
    if (src.type === "object") {
        if (tgt.type !== "object") return null;
        if (ori === 0) return null;  // dropping "into" object not supported
        return { kind: "object", sourceId: src.id, targetId: tgt.id, ori };
    }

    // Renderer / rendGroup → renderer / rendGroup.
    if (src.type === "renderer" || src.type === "rendGroup") {
        if (tgt.type !== "renderer" && tgt.type !== "rendGroup") return null;

        const srcPar = parentLookup(src.id);
        const tgtPar = parentLookup(tgt.id);
        if (!srcPar || !tgtPar) return null;

        // Resolve dest obj + group, mirroring UXP `dropImpl` table.
        let destObj: SceneTreeNode | null = null;
        let destGroupName = "";

        // "Drop INTO rendGroup" — only valid for source=renderer (rendgrps
        // cannot nest). UXP: `if elem.type=="rendGroup" && ori==0`.
        if (tgt.type === "rendGroup" && ori === 0) {
            if (src.type !== "renderer") return null;
            destObj = parentLookup(tgt.id);  // group's parent (an object)
            if (!destObj || destObj.type !== "object") return null;
            destGroupName = tgt.name;
            // UXP: if group has children, snap target to its first child;
            // otherwise keep target = group uid (worker treats sourceId ==
            // targetId as "no slot swap, just update rend.group").
            const targetId = tgt.children.length > 0
                ? tgt.children[0].id
                : tgt.id;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: destObj.id,
                destGroupName,
                targetId,
                ori: 0,
            };
        }

        // Same parent: in-place reorder. Source is allowed to be a
        // rendGroup as long as we stay within the same object.
        if (srcPar.id === tgtPar.id) {
            destObj = srcPar.type === "object" ? srcPar : parentLookup(srcPar.id);
            if (!destObj || destObj.type !== "object") return null;
            destGroupName = srcPar.type === "rendGroup" ? srcPar.name : "";
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: destObj.id,
                destGroupName,
                targetId: tgt.id,
                ori,
            };
        }

        // Cross-parent move. rendGroups cannot move across parents.
        if (src.type === "rendGroup") return null;

        // Allowed transitions (UXP):
        //   srcPar=object,    tgtPar=rendGroup (same obj): obj → group
        //   srcPar=rendGroup, tgtPar=object   (same obj): group → root
        //   srcPar=rendGroup, tgtPar=rendGroup(same obj): group → group
        if (srcPar.type === "object" && tgtPar.type === "rendGroup") {
            // tgtPar's parent must equal srcPar (same object).
            const grpParent = parentLookup(tgtPar.id);
            if (!grpParent || grpParent.id !== srcPar.id) return null;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: srcPar.id,
                destGroupName: tgtPar.name,
                targetId: tgt.id,
                ori,
            };
        }
        if (srcPar.type === "rendGroup" && tgtPar.type === "object") {
            const grpParent = parentLookup(srcPar.id);
            if (!grpParent || grpParent.id !== tgtPar.id) return null;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: tgtPar.id,
                destGroupName: "",
                targetId: tgt.id,
                ori,
            };
        }
        if (srcPar.type === "rendGroup" && tgtPar.type === "rendGroup") {
            const a = parentLookup(srcPar.id);
            const b = parentLookup(tgtPar.id);
            if (!a || !b || a.id !== b.id) return null;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: a.id,
                destGroupName: tgtPar.name,
                targetId: tgt.id,
                ori,
            };
        }
    }
    return null;
}

/** Y-position → orientation. Top 1/3 = -1, middle = 0, bottom 1/3 = +1. */
function computeOri(rect: DOMRect, clientY: number): DragOri {
    const rel = clientY - rect.top;
    const t = rect.height / 3;
    if (rel < t) return -1;
    if (rel > rect.height - t) return 1;
    return 0;
}

/* ─── Node-type → icon mapping ─── */

const TYPE_ICON: Record<SceneNodeType, IconName> = {
    scene: "film",
    object: "cube",
    renderer: "style",
    rendGroup: "folder-close",
    cameraRoot: "camera",
    styleRoot: "folder-close",
    camera: "camera",
    style: "tag",
};

/* ─── Props ─── */

interface ScenePaneProps {
    /** Root scene node from `useSceneTree`. Null while loading or when no scene is active. */
    tree: SceneTreeNode | null;
    /** Currently selected node ID (string for compatibility with existing inspector wiring). */
    selectedId: string;
    /**
     * Multi-select set (Phase 4c). Drives visual selection on multiple
     * rows. When omitted, falls back to single-select (selectedId only).
     */
    selectedIds?: Set<string>;
    onSelect: (id: string) => void;
    /**
     * Cmd/Ctrl+click handler — toggles membership of `id` in selectedIds.
     * When omitted, modifier-clicks fall back to single-select.
     */
    onToggleSelect?: (id: string) => void;
    onToggleVisibility: (id: string) => void;
    onAddObject?: () => void;
    onAddRenderer?: () => void;
    onDeleteSelected?: (id: string) => void;
    onFocusSelected?: (id: string) => void;
    onShowProperty?: (id: string) => void;
    /**
     * Double-click handler — UXP `onTreeItemClick` `aEvent.detail==2`
     * branch: camera rows run `loadCamImpl(name, true)` (Apply to view
     * with vis flags); other rows run `onPropCmd` (Properties dialog).
     */
    onNodeDoubleClick?: (node: SceneTreeNode) => void;
    /**
     * Controlled inline-rename: when non-null, the row with this id
     * shows an `<InputGroup>` in place of its label. The trigger lives
     * at App level so both F2 (started via `onBeginInlineRename`) and
     * the ctxmenu Rename action route through the same controller.
     */
    editingNodeId?: string | null;
    /**
     * F2 (or other in-tree trigger) requesting that the given row enter
     * inline-rename mode. ScenePane forwards `selectedId` here on F2;
     * the App-level controller decides whether to accept.
     */
    onBeginInlineRename?: (id: string) => void;
    /** Esc / blur-without-commit asks the controller to drop the editor. */
    onCancelInlineRename?: () => void;
    /**
     * Inline-rename commit handler. ScenePane handles the
     * `<InputGroup>` editor; on Enter (or blur with a non-empty edit
     * that differs from the original name) it calls back here with the
     * targeted node and the user-entered name. The caller is expected
     * to route to the appropriate worker service — UXP `onRenameCamera`
     * for camera rows, `renameNode` for object / renderer / rendGroup —
     * AND to clear `editingNodeId` afterwards.
     */
    onCommitInlineRename?: (node: SceneTreeNode, newName: string) => void;
    /** Right-click handler — opens native context menu for the targeted node. */
    onShowContextMenu?: (node: SceneTreeNode, x: number, y: number) => void;
    /**
     * Drag-drop reorder callback (Phase 4b). Receives a fully-resolved
     * `MoveSceneNodeArgs`; ScenePane handles the validation + ori math.
     * Return value is ignored — ScenePane uses event-driven refetch.
     */
    onMoveNode?: (args: MoveSceneNodeArgs) => unknown;
    /**
     * Per-action enablement for the current selection. When omitted, all
     * actions are enabled (legacy callers). Defaults to enabled=true so a
     * caller that does not yet compute this still works.
     */
    opsEnabled?: { focus: boolean; delete: boolean; property: boolean; add: boolean };
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/* ─── Component ─── */

export const ScenePane: React.FC<ScenePaneProps> = ({
    tree,
    selectedId,
    selectedIds,
    onSelect,
    onToggleSelect,
    onToggleVisibility,
    onAddRenderer,
    onDeleteSelected,
    onFocusSelected,
    onShowProperty,
    onNodeDoubleClick,
    editingNodeId,
    onBeginInlineRename,
    onCancelInlineRename,
    onCommitInlineRename,
    onShowContextMenu,
    onMoveNode,
    opsEnabled,
    collapsed,
    onToggleCollapse,
}) => {
    const hasSelection = selectedId !== '';
    const canFocus = hasSelection && (opsEnabled?.focus ?? true);
    const canDelete = hasSelection && (opsEnabled?.delete ?? true);
    const canProperty = hasSelection && (opsEnabled?.property ?? true);
    const canAdd = hasSelection && (opsEnabled?.add ?? true);
    // Tracks user expand/collapse overrides per row id. Default state
    // comes from the SceneTreeNode's `uiCollapsed` hint (C++ for real
    // nodes, true for the synthesised cameraRoot / styleRoot containers
    // so they start closed). A boolean override here wins:
    //   true  → user explicitly expanded
    //   false → user explicitly collapsed
    //   missing → use uiCollapsed default
    // The previous "collapsedIds set" form could not distinguish
    // "default-collapsed" from "user-collapsed", which meant a single
    // expand click on a default-collapsed row (e.g. Styles root) was
    // a no-op — the id was never in the set, so deleting it changed
    // nothing.
    const [expandOverrides, setExpandOverrides] = useState<Map<string, boolean>>(
        () => new Map(),
    );

    // Mid-drag drop indicator: the row id currently hovered plus the
    // resolved orientation. Only set when planSceneNodeMove accepts the
    // (source, target, ori) combo, so the line never shows on an invalid
    // drop position. `dragSourceRef` carries the dragged node across the
    // dragover phase, where `dataTransfer.getData` is unavailable.
    const [dropIndicator, setDropIndicator] =
        useState<{ id: string; ori: DragOri } | null>(null);
    const dragSourceRef = useRef<SceneTreeNode | null>(null);

    // Inline-rename is now controlled by the parent (App.tsx). ScenePane
    // only owns the InputGroup focus ref and stashes callback refs so the
    // handlers stay stable across renders.
    const inlineInputRef = useRef<HTMLInputElement | null>(null);
    const beginRenameRef = useRef(onBeginInlineRename);
    beginRenameRef.current = onBeginInlineRename;
    const commitRenameRef = useRef(onCommitInlineRename);
    commitRenameRef.current = onCommitInlineRename;
    const cancelRenameRef = useRef(onCancelInlineRename);
    cancelRenameRef.current = onCancelInlineRename;

    // id → SceneTreeNode lookup so click / dblclick / ctxmenu handlers
    // can resolve a Blueprint TreeNodeInfo back to the typed node. Kept
    // close to the rename logic because both rely on it.
    const nodeLookup = useMemo<Map<string, SceneTreeNode>>(() => {
        const map = new Map<string, SceneTreeNode>();
        if (!tree) return map;
        const walk = (n: SceneTreeNode): void => {
            map.set(String(n.id), n);
            for (const c of n.children) walk(c);
        };
        walk(tree);
        return map;
    }, [tree]);

    // Whether the given node accepts a rename (inline + ctxmenu).
    // Routing (in App.handleCommitInlineRename):
    //   - camera → renameCamera (atomic destroy + setCamera; cameras
    //     have no in-place name setter once registered)
    //   - everything else → renameNode worker
    // renameNode itself accepts object / renderer / rendGroup / scene
    // (scene uses scene.setName since `Scene.name` is read-only at the
    // .qif level). cameraRoot / styleRoot / style are not renameable.
    const isRenameableType = useCallback((t: SceneNodeType): boolean => {
        return (
            t === "scene" ||
            t === "object" || t === "renderer" || t === "rendGroup" ||
            t === "camera"
        );
    }, []);

    // Click-pause-click rename schedule (Finder / Explorer parity).
    // When the user clicks an already-selected single-selected renameable
    // row, we set a small timer to enter rename mode. The timer is
    // canceled by: a double-click on the same row (treated as a real
    // double-click), a click on a different row, the editor opening from
    // another path (F2 / ctxmenu Rename), or unmount.
    //
    // The delay must be at least the browser double-click threshold so a
    // real dblclick has time to cancel the schedule. 500ms is the macOS
    // / Windows default; we use the same.
    const RENAME_CLICK_DELAY_MS = 500;
    const renameTimerRef = useRef<number | null>(null);
    const clearRenameTimer = useCallback(() => {
        if (renameTimerRef.current !== null) {
            window.clearTimeout(renameTimerRef.current);
            renameTimerRef.current = null;
        }
    }, []);
    // Latest selectedId in a ref so the timeout closure can re-check
    // whether the targeted row is still selected when the delay elapses.
    const selectedIdAtScheduleRef = useRef<string | null>(null);
    const scheduleRename = useCallback((id: string) => {
        clearRenameTimer();
        selectedIdAtScheduleRef.current = id;
        renameTimerRef.current = window.setTimeout(() => {
            renameTimerRef.current = null;
            // Defensive: only fire when the targeted row is still the
            // single selection (the user may have clicked away inside
            // the click-pause window).
            if (selectedIdAtScheduleRef.current === id) {
                beginRenameRef.current?.(id);
            }
        }, RENAME_CLICK_DELAY_MS);
    }, [clearRenameTimer]);

    // Cancel any pending click-pause schedule when an editor opens from
    // another path (F2 / ctxmenu Rename), and on unmount.
    useEffect(() => {
        if (editingNodeId != null) clearRenameTimer();
    }, [editingNodeId, clearRenameTimer]);
    useEffect(() => clearRenameTimer, [clearRenameTimer]);

    const handleNodeExpand = useCallback((node: TreeNodeInfo) => {
        setExpandOverrides((prev) => {
            const next = new Map(prev);
            next.set(String(node.id), true);
            return next;
        });
    }, []);

    const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
        setExpandOverrides((prev) => {
            const next = new Map(prev);
            next.set(String(node.id), false);
            return next;
        });
    }, []);

    const handleNodeClick = useCallback(
        (
            node: TreeNodeInfo,
            _path: number[],
            e: React.MouseEvent<HTMLElement>,
        ) => {
            const idStr = String(node.id);
            // Cmd (macOS) or Ctrl (other) toggles the node in the multi-
            // select set. Shift+click would normally extend a contiguous
            // range; deferred — UXP's multi-select is also additive-only
            // via Cmd-click, with Shift behaving as a range select that
            // we don't migrate in Phase 4c.
            if ((e.metaKey || e.ctrlKey) && onToggleSelect) {
                clearRenameTimer();
                onToggleSelect(idStr);
                return;
            }
            // Click-pause-click rename (Finder / Explorer parity).
            // Triggered when the same single-selected, renameable row is
            // clicked a second time without modifiers and not as part of
            // a dblclick (handleNodeDoubleClick cancels the timer).
            const isAlreadySelected = selectedId === idStr;
            const isSingleSelected = !selectedIds || selectedIds.size <= 1;
            if (isAlreadySelected && isSingleSelected) {
                const sceneNode = nodeLookup.get(idStr);
                if (sceneNode && isRenameableType(sceneNode.type)) {
                    scheduleRename(idStr);
                    return;
                }
            }
            // Selecting a different row (or a non-renameable row): cancel
            // any pending schedule before the selection state mutates.
            clearRenameTimer();
            onSelect(idStr);
        },
        [
            onSelect, onToggleSelect, selectedId, selectedIds,
            nodeLookup, isRenameableType, scheduleRename, clearRenameTimer,
        ],
    );


    // Build an id → SceneTreeNode lookup so onNodeContextMenu (which only
    // receives the Blueprint TreeNodeInfo) can resolve back to the original
    // typed node and forward it to the caller.
    // F2 begins inline rename on the current selection. We bind the
    // listener on the scrolling wrapper (not document) so the shortcut
    // only fires while the user is focused inside the scene tree.
    const handleTreeKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key !== "F2") return;
            if (!beginRenameRef.current) return;
            if (!selectedId) return;
            const node = nodeLookup.get(selectedId);
            if (!node) return;
            if (!isRenameableType(node.type)) return;
            e.preventDefault();
            beginRenameRef.current(selectedId);
        },
        [selectedId, nodeLookup, isRenameableType],
    );

    // Auto-focus + select the inline input each time the editor opens.
    useEffect(() => {
        if (editingNodeId == null) return;
        const id = window.setTimeout(() => {
            inlineInputRef.current?.focus();
            inlineInputRef.current?.select();
        }, 0);
        return () => window.clearTimeout(id);
    }, [editingNodeId]);

    // Commit / cancel forward to the App-level controller. The controller
    // is also responsible for clearing `editingNodeId`.
    const commitEdit = useCallback(
        (next: string) => {
            if (editingNodeId == null) return;
            const node = nodeLookup.get(editingNodeId);
            if (!node) {
                cancelRenameRef.current?.();
                return;
            }
            const trimmed = next.trim();
            if (trimmed === "" || trimmed === node.name) {
                cancelRenameRef.current?.();
                return;
            }
            commitRenameRef.current?.(node, trimmed);
        },
        [editingNodeId, nodeLookup],
    );

    const cancelEdit = useCallback(() => {
        cancelRenameRef.current?.();
    }, []);

    // id → parent lookup, used by DnD to resolve same-parent / cross-group
    // moves. Parent is null for the scene root.
    const parentMap = useMemo<Map<number, SceneTreeNode>>(() => {
        const map = new Map<number, SceneTreeNode>();
        if (!tree) return map;
        const walk = (n: SceneTreeNode): void => {
            for (const c of n.children) {
                map.set(c.id, n);
                walk(c);
            }
        };
        walk(tree);
        return map;
    }, [tree]);
    const parentLookup = useCallback(
        (id: number): SceneTreeNode | null => parentMap.get(id) ?? null,
        [parentMap],
    );

    const handleDragStart = useCallback(
        (e: React.DragEvent<HTMLSpanElement>, node: SceneTreeNode) => {
            if (
                node.type !== "object" &&
                node.type !== "renderer" &&
                node.type !== "rendGroup"
            ) {
                e.preventDefault();
                return;
            }
            const payload: DragSourcePayload = { id: node.id, type: node.type };
            dragSourceRef.current = node;
            e.dataTransfer.setData(SCENE_NODE_MIME, JSON.stringify(payload));
            e.dataTransfer.effectAllowed = "move";
        },
        [],
    );

    const readDragSource = useCallback(
        (e: React.DragEvent<HTMLSpanElement>): SceneTreeNode | null => {
            const raw = e.dataTransfer.getData(SCENE_NODE_MIME);
            if (!raw) return null;
            try {
                const parsed = JSON.parse(raw) as DragSourcePayload;
                return nodeLookup.get(String(parsed.id)) ?? null;
            } catch {
                return null;
            }
        },
        [nodeLookup],
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent<HTMLSpanElement>, node: SceneTreeNode) => {
            if (!onMoveNode) return;
            const types = e.dataTransfer.types;
            if (!Array.from(types).includes(SCENE_NODE_MIME)) return;
            // Allow the drop so the browser displays a "move" cursor.
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            // Mid-drag indicator: resolve ori + validity so the line is
            // shown only where a drop would actually be accepted.
            // dataTransfer.getData is unavailable on dragover, so the
            // source node comes from the dragstart-stashed ref.
            const src = dragSourceRef.current;
            const rect = e.currentTarget.getBoundingClientRect();
            const ori = computeOri(rect, e.clientY);
            const plan = src
                ? planSceneNodeMove(src, node, ori, parentLookup)
                : null;
            setDropIndicator((prev) => {
                if (!plan) return prev === null ? prev : null;
                const id = String(node.id);
                // dragover fires continuously; skip the state update
                // (and re-render) when the target row + ori are unchanged.
                if (prev && prev.id === id && prev.ori === ori) return prev;
                return { id, ori };
            });
        },
        [onMoveNode, parentLookup],
    );

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLSpanElement>, target: SceneTreeNode) => {
            if (!onMoveNode) return;
            const src = readDragSource(e);
            setDropIndicator(null);
            dragSourceRef.current = null;
            if (!src) return;
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const ori = computeOri(rect, e.clientY);
            const plan = planSceneNodeMove(src, target, ori, parentLookup);
            if (!plan) return;
            void onMoveNode(plan);
        },
        [onMoveNode, parentLookup, readDragSource],
    );

    // Clear the drag state when the drag ends (drop, Esc, or release
    // outside any target) and when the pointer leaves the tree entirely.
    const handleDragEnd = useCallback(() => {
        dragSourceRef.current = null;
        setDropIndicator(null);
    }, []);

    const handleTreeDragLeave = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            const related = e.relatedTarget as Node | null;
            if (related && e.currentTarget.contains(related)) return;
            setDropIndicator(null);
        },
        [],
    );

    const handleNodeContextMenu = useCallback(
        (node: TreeNodeInfo, _path: number[], e: React.MouseEvent<HTMLElement>) => {
            if (!onShowContextMenu) return;
            const idStr = String(node.id);
            const sceneNode = nodeLookup.get(idStr);
            if (!sceneNode) return;
            e.preventDefault();
            // Preserve multi-selection when right-clicking on one of the
            // already-selected rows (UXP behaviour). Otherwise reset to
            // single selection of the right-clicked row.
            const inMulti =
                selectedIds && selectedIds.size > 1 && selectedIds.has(idStr);
            if (!inMulti) {
                onSelect(idStr);
            }
            onShowContextMenu(sceneNode, e.clientX, e.clientY);
        },
        [nodeLookup, onShowContextMenu, onSelect, selectedIds],
    );

    // Blueprint Tree's `onNodeDoubleClick` fires after the second mouse-up
    // of a click pair. Resolve back to the typed SceneTreeNode and forward
    // to the caller — UXP `onTreeItemClick` `aEvent.detail==2` path.
    // Also cancel any click-pause rename schedule the second click would
    // have armed: a real double-click takes precedence over rename.
    const handleNodeDoubleClick = useCallback(
        (info: TreeNodeInfo) => {
            clearRenameTimer();
            if (!onNodeDoubleClick) return;
            const node = nodeLookup.get(String(info.id));
            if (node) onNodeDoubleClick(node);
        },
        [nodeLookup, onNodeDoubleClick, clearRenameTimer],
    );

    const visibilityButton = useCallback(
        (nodeId: string, node: SceneTreeNode) => {
            // Only object / renderer / rendGroup carry a real visibility flag.
            if (
                node.type !== "object" &&
                node.type !== "renderer" &&
                node.type !== "rendGroup"
            ) {
                return undefined;
            }
            const eyeIcon: IconName = node.visible ? "eye-open" : "eye-off";
            const disabledByAncestor = node.visible && !node.effectiveVisible;
            const className =
                "visibility-toggle " +
                (node.effectiveVisible
                    ? "visible"
                    : disabledByAncestor
                      ? "disabled"
                      : "hidden");
            return (
                <Button
                    minimal
                    small
                    icon={<Icon icon={eyeIcon} size={14} />}
                    className={className}
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onToggleVisibility(nodeId);
                    }}
                />
            );
        },
        [onToggleVisibility],
    );

    const treeContents: TreeNodeInfo[] = useMemo(() => {
        if (!tree) return [];

        const isExpanded = (n: SceneTreeNode, idStr: string): boolean => {
            // User override wins (true=expanded, false=collapsed).
            const ovr = expandOverrides.get(idStr);
            if (ovr !== undefined) return ovr;
            // Default: respect uiCollapsed hint from C++ / synthesized roots.
            // (cameraRoot / styleRoot ship uiCollapsed=true so they start closed.)
            return !n.uiCollapsed;
        };

        const draggable =
            (n: SceneTreeNode): boolean =>
                n.type === "object" ||
                n.type === "renderer" ||
                n.type === "rendGroup";

        const wrapLabel = (n: SceneTreeNode): string | React.JSX.Element => {
            const idStr = String(n.id);
            // Inline-rename editor takes over the label when this row is
            // the editing target. The InputGroup stops click propagation
            // so typing inside doesn't toggle the Blueprint Tree row.
            if (editingNodeId === idStr) {
                return (
                    <InlineRenameInput
                        inputRef={inlineInputRef}
                        defaultValue={n.name}
                        onCommit={commitEdit}
                        onCancel={cancelEdit}
                    />
                );
            }
            const text = nodeLabel(n);
            if (!onMoveNode) return text;
            // The draggable span fills the whole Blueprint label cell
            // (`display: block; width: 100%`) so drag-start and drop
            // register anywhere across the row's label area, not just on
            // the glyphs. An inline-block span sized to the text left
            // most of the visible row a dead zone (ADR-0001).
            const ind =
                dropIndicator && dropIndicator.id === idStr
                    ? dropIndicator.ori
                    : null;
            return (
                <span
                    draggable={draggable(n)}
                    onDragStart={(e) => handleDragStart(e, n)}
                    onDragOver={(e) => handleDragOver(e, n)}
                    onDrop={(e) => handleDrop(e, n)}
                    onDragEnd={handleDragEnd}
                    data-node-id={String(n.id)}
                    className={"sn-row-label" + (ind === 0 ? " sn-drop-into" : "")}
                    style={{
                        display: "block",
                        position: "relative",
                        width: "100%",
                        lineHeight: "22px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        cursor: draggable(n) ? "grab" : "default",
                    }}
                >
                    {text}
                    {ind === -1 && (
                        <span className="sn-drop-line sn-drop-line-top" />
                    )}
                    {ind === 1 && (
                        <span className="sn-drop-line sn-drop-line-bottom" />
                    )}
                </span>
            );
        };

        const isRowSelected = (idStr: string): boolean =>
            (selectedIds && selectedIds.size > 0)
                ? selectedIds.has(idStr)
                : selectedId === idStr;

        const buildNode = (n: SceneTreeNode): TreeNodeInfo => {
            const idStr = String(n.id);
            const hasChildren = n.children.length > 0;
            return {
                id: idStr,
                label: wrapLabel(n),
                icon: TYPE_ICON[n.type],
                isExpanded: hasChildren && isExpanded(n, idStr),
                isSelected: isRowSelected(idStr),
                secondaryLabel: visibilityButton(idStr, n),
                hasCaret: hasChildren,
                childNodes: hasChildren ? n.children.map(buildNode) : undefined,
            };
        };

        // UXP layout: scene row + objects + cameraRoot + styleRoot are ALL
        // siblings at depth 0. The scene row itself is a leaf (no children).
        //
        // Route the scene label through wrapLabel like every other row so
        // the inline-rename editor (gated on editingNodeId === idStr)
        // actually replaces the label when the user enters rename mode
        // on the scene row.
        const sceneIdStr = String(tree.id);
        const sceneRow: TreeNodeInfo = {
            id: sceneIdStr,
            label: wrapLabel(tree),
            icon: TYPE_ICON.scene,
            isSelected: isRowSelected(sceneIdStr),
            hasCaret: false,
        };
        return [sceneRow, ...tree.children.map(buildNode)];
    }, [
        tree, expandOverrides, selectedId, selectedIds, visibilityButton,
        onMoveNode, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
        dropIndicator, editingNodeId, commitEdit, cancelEdit,
    ]);

    return (
        <div className="sp-pane">
            <div
                className={`sp-section-header ${onToggleCollapse ? "collapsible" : ""}`}
                onClick={onToggleCollapse}
            >
                <div className="sp-section-header-left">
                    <Icon
                        icon={collapsed ? "chevron-right" : "chevron-down"}
                        size={12}
                        className="section-chevron"
                    />
                    <span className="section-title scene-name-title">Scene</span>
                </div>
                <div
                    className="sp-section-header-actions"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ButtonGroup minimal>
                        <Tooltip content="Add" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="add" size={14} />}
                                className="section-action-btn"
                                disabled={!onAddRenderer || !canAdd}
                                onClick={onAddRenderer}
                            />
                        </Tooltip>
                        <Tooltip content="Focus" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="locate" size={14} />}
                                className="section-action-btn"
                                disabled={!canFocus}
                                onClick={() => onFocusSelected?.(selectedId)}
                            />
                        </Tooltip>
                        <Tooltip content="Delete" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="trash" size={14} />}
                                className="section-action-btn"
                                disabled={!canDelete}
                                onClick={() => onDeleteSelected?.(selectedId)}
                            />
                        </Tooltip>
                        <Tooltip content="Property" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="properties" size={14} />}
                                className="section-action-btn"
                                disabled={!canProperty}
                                onClick={() => onShowProperty?.(selectedId)}
                            />
                        </Tooltip>
                    </ButtonGroup>
                </div>
            </div>
            {!collapsed && tree && treeContents.length > 0 && (
                // tabIndex=-1 keeps the wrapper focusable for the F2
                // keydown shortcut (Blueprint Tree rows are not natively
                // focusable, so the click-target's focus bubbles up here),
                // but removes it from the Tab order so keyboard nav skips
                // it. `outline: none` suppresses the browser default
                // focus ring — the selected-row background already
                // conveys selection, and the ring rendered around an
                // inner row label looked like a glitch (issue 2026-05-13).
                <div
                    className="sp-pane-scroll"
                    tabIndex={-1}
                    onKeyDown={handleTreeKeyDown}
                    onDragLeave={handleTreeDragLeave}
                    style={{ outline: 'none' }}
                >
                    <Tree
                        contents={treeContents}
                        onNodeClick={handleNodeClick}
                        onNodeDoubleClick={handleNodeDoubleClick}
                        onNodeExpand={handleNodeExpand}
                        onNodeCollapse={handleNodeCollapse}
                        onNodeContextMenu={handleNodeContextMenu}
                        className="scene-tree"
                    />
                </div>
            )}
        </div>
    );
};

/**
 * Inline rename text input embedded inside a Blueprint Tree row label.
 *
 *   - Enter / blur with a non-empty edit → commit
 *   - Escape → cancel (label is restored)
 *   - clicks inside the input do NOT toggle the parent tree row
 *     (stopPropagation in mousedown/click)
 *
 * Kept as a small local component so the rendered label has stable
 * identity between renders — Blueprint Tree compares label props
 * shallowly when deciding whether to reapply selection styles.
 */
const InlineRenameInput: React.FC<{
    inputRef: React.MutableRefObject<HTMLInputElement | null>;
    defaultValue: string;
    onCommit: (value: string) => void;
    onCancel: () => void;
}> = ({ inputRef, defaultValue, onCommit, onCancel }) => {
    const [value, setValue] = useState(defaultValue);
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onCommit(value);
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
            }
        },
        [value, onCommit, onCancel],
    );
    return (
        <InputGroup
            inputRef={(el) => { inputRef.current = el; }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => onCommit(value)}
            // Prevent Blueprint Tree's row click from stealing focus / toggling
            // selection while the user types inside the editor.
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            small
            autoComplete="off"
            style={{ display: "inline-flex", minWidth: 120 }}
        />
    );
};

function nodeLabel(node: SceneTreeNode): string {
    switch (node.type) {
        case "scene":
            return `Scene: ${node.name || "Untitled"}`;
        case "object":
            return node.className ? `${node.name} (${node.className})` : node.name;
        case "renderer":
            return node.className ? `${node.name} (${node.className})` : node.name;
        case "rendGroup":
        case "cameraRoot":
        case "styleRoot":
        case "camera":
        case "style":
        default:
            return node.name;
    }
}
