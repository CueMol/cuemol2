/**
 * @file ScenePane.tsx
 * @description Hierarchical scene tree pane mirroring the UXP
 * `panel.workspace` layout.
 *
 * Tree layout:
 *   "Scene: <name>"          -- scene row (no children, a leaf)
 *   object1 (PDBMol)         -- object branches
 *     renderer1 (cartoon)
 *   object2 (...)
 *   Camera                   -- cameraRoot (children = saved cameras)
 *   Styles                   -- styleRoot (children = registered styles)
 *
 * Scene, objects, cameraRoot and styleRoot are all top-level siblings; the
 * scene row itself does not nest the objects beneath it.
 *
 * @module ScenePane
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
    Tree,
    Button,
    ButtonGroup,
    Tooltip,
    type TreeNodeInfo,
} from "@blueprintjs/core";
import { AppIcon } from "../AppIcon";
import type { AppIconKey } from "../../data/appIcons";

import type { SceneNodeType, SceneTreeNode } from "../../worker/shared/sceneTreeTypes";
import {
    SCENE_NODE_MIME,
    planSceneNodeMove,
    computeOri,
    type DragSourcePayload,
    type DragOri,
    type MoveSceneNodeArgs,
} from "./sceneTreeDnd";
import { InlineRenameInput } from "./InlineRenameInput";
import { SectionHeader } from "./SectionHeader";

/* --- Node-type to icon mapping --- */

const TYPE_ICON: Record<SceneNodeType, AppIconKey> = {
    scene: "node.scene",
    object: "node.object",
    renderer: "node.renderer",
    rendGroup: "node.group",
    cameraRoot: "node.camera",
    styleRoot: "node.group",
    camera: "node.camera",
    style: "node.style",
};

/* --- Props --- */

interface ScenePaneProps {
    /** Root scene node from `useSceneTree`. Null while loading or when no scene is active. */
    tree: SceneTreeNode | null;
    /** Currently selected node ID (string for compatibility with existing inspector wiring). */
    selectedId: string;
    /**
     * Multi-select set. Drives visual selection on multiple rows. When
     * omitted, falls back to single-select (selectedId only).
     */
    selectedIds?: Set<string>;
    onSelect: (id: string) => void;
    /**
     * Cmd/Ctrl+click handler -- toggles membership of `id` in selectedIds.
     * When omitted, modifier-clicks fall back to single-select.
     */
    onToggleSelect?: (id: string) => void;
    /**
     * Shift+click range select. Receives the clicked id, the ids of every
     * currently visible row in display order, and whether the range should
     * be added to the existing selection (Shift+Cmd) rather than replace it.
     * When omitted, Shift+click falls back to single-select.
     */
    onSelectRange?: (id: string, visibleIds: string[], additive: boolean) => void;
    onToggleVisibility: (id: string) => void;
    onAddObject?: () => void;
    onAddRenderer?: () => void;
    onDeleteSelected?: (id: string) => void;
    onFocusSelected?: (id: string) => void;
    onShowProperty?: (id: string) => void;
    /**
     * Double-click handler -- UXP `onTreeItemClick` `aEvent.detail==2`
     * branch: camera rows run `loadCamImpl(name, true)` (Apply to view
     * with vis flags); other rows run `onPropCmd` (Properties dialog).
     */
    onNodeDoubleClick?: (node: SceneTreeNode) => void;
    /**
     * Controlled inline-rename: when non-null, the row with this id shows
     * an `<InputGroup>` in place of its label. The trigger is owned by
     * `useSceneTreeController` so both F2 (started via `onBeginInlineRename`)
     * and the ctxmenu Rename action route through the same controller.
     */
    editingNodeId?: string | null;
    /**
     * F2 (or other in-tree trigger) requesting that the given row enter
     * inline-rename mode. ScenePane forwards `selectedId` here on F2;
     * `useSceneTreeController` decides whether to accept.
     */
    onBeginInlineRename?: (id: string) => void;
    /** Esc / blur-without-commit asks the controller to drop the editor. */
    onCancelInlineRename?: () => void;
    /**
     * Inline-rename commit handler. ScenePane handles the `<InputGroup>`
     * editor; on Enter (or blur with a non-empty edit that differs from the
     * original name) it calls back here with the targeted node and the
     * user-entered name. The caller routes to the appropriate worker
     * service (renameCamera for camera rows, renameNode otherwise) and
     * clears `editingNodeId` afterwards.
     */
    onCommitInlineRename?: (node: SceneTreeNode, newName: string) => void;
    /** Right-click handler -- opens native context menu for the targeted node. */
    onShowContextMenu?: (node: SceneTreeNode, x: number, y: number) => void;
    /**
     * Drag-drop reorder callback. Receives a fully-resolved
     * `MoveSceneNodeArgs`; ScenePane handles the validation and ori math.
     * The return value is ignored - ScenePane uses event-driven refetch.
     */
    onMoveNode?: (args: MoveSceneNodeArgs) => unknown;
    /**
     * Per-action enablement for the current selection. When omitted, all
     * actions are enabled (legacy callers). Defaults to enabled=true so a
     * caller that does not yet compute this still works.
     */
    opsEnabled?: { focus: boolean; delete: boolean; property: boolean; add: boolean };
    /**
     * Row expand/collapse notification (collapsed=true on collapse). The
     * controller persists object / rendGroup rows into C++ `ui_collapsed`
     * so the state survives a qsc save/load. Unrelated to the pane-level
     * `collapsed` / `onToggleCollapse` pair below (SectionHeader folding).
     */
    onNodeExpandChange?: (node: SceneTreeNode, collapsed: boolean) => void;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/* --- Component --- */

/**
 * Scene tree pane: renders the hierarchical scene / object / renderer tree
 * with a per-row visibility toggle, multi-select, drag-drop reorder, inline
 * rename and a right-click context menu.
 *
 * Selection, the editing-row id and the move / menu callbacks are owned by
 * the parent (`useSceneTreeController`); this component handles the
 * Blueprint `Tree` wiring, the click-pause-click rename schedule, and the
 * drag-drop geometry.
 */
export const ScenePane: React.FC<ScenePaneProps> = ({
    tree,
    selectedId,
    selectedIds,
    onSelect,
    onToggleSelect,
    onSelectRange,
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
    onNodeExpandChange,
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
    //   true  -> user explicitly expanded
    //   false -> user explicitly collapsed
    //   missing -> use uiCollapsed default
    // The previous "collapsedIds set" form could not distinguish
    // "default-collapsed" from "user-collapsed", which meant a single
    // expand click on a default-collapsed row (e.g. Styles root) was
    // a no-op -- the id was never in the set, so deleting it changed
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

    // Inline-rename is controlled by the parent (useSceneTreeController).
    // ScenePane only owns the InputGroup focus ref and stashes callback
    // refs so the handlers stay stable across renders.
    const inlineInputRef = useRef<HTMLInputElement | null>(null);
    const beginRenameRef = useRef(onBeginInlineRename);
    beginRenameRef.current = onBeginInlineRename;
    const commitRenameRef = useRef(onCommitInlineRename);
    commitRenameRef.current = onCommitInlineRename;
    const cancelRenameRef = useRef(onCancelInlineRename);
    cancelRenameRef.current = onCancelInlineRename;

    // id -> SceneTreeNode lookup so click / dblclick / ctxmenu handlers
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
    // Commit routing (in useSceneTreeController): camera rows go through
    // renameCamera (atomic destroy + setCamera, since a registered camera
    // has no in-place name setter); every other type goes through the
    // renameNode worker, which accepts object / renderer / rendGroup /
    // scene (scene uses scene.setName as Scene.name is read-only at the
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

    // Notify the controller of expand/collapse so object / rendGroup rows
    // persist `ui_collapsed` (held in a ref like the rename callbacks so
    // the handlers stay identity-stable across renders).
    const expandChangeRef = useRef(onNodeExpandChange);
    expandChangeRef.current = onNodeExpandChange;

    const handleNodeExpand = useCallback((node: TreeNodeInfo) => {
        setExpandOverrides((prev) => {
            const next = new Map(prev);
            next.set(String(node.id), true);
            return next;
        });
        const sceneNode = nodeLookup.get(String(node.id));
        if (sceneNode) expandChangeRef.current?.(sceneNode, false);
    }, [nodeLookup]);

    const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
        setExpandOverrides((prev) => {
            const next = new Map(prev);
            next.set(String(node.id), false);
            return next;
        });
        const sceneNode = nodeLookup.get(String(node.id));
        if (sceneNode) expandChangeRef.current?.(sceneNode, true);
    }, [nodeLookup]);

    // Visible-row order for Shift+click, kept in a ref because the handler
    // below is declared before `treeContents` (which it is derived from).
    const visibleRowIdsRef = useRef<string[]>([]);

    const handleNodeClick = useCallback(
        (
            node: TreeNodeInfo,
            _path: number[],
            e: React.MouseEvent<HTMLElement>,
        ) => {
            const idStr = String(node.id);
            // Shift extends from the anchor (the current primary selection)
            // across the rows as displayed; Shift+Cmd unions instead of
            // replacing. If either end is not currently visible the handler
            // is a no-op and we fall through to a plain click below.
            if (e.shiftKey && onSelectRange && selectedId) {
                // Read through a ref: `visibleRowIds` is derived from
                // `treeContents`, which is declared after this handler.
                const visible = visibleRowIdsRef.current;
                if (visible.includes(selectedId) && visible.includes(idStr)) {
                    clearRenameTimer();
                    onSelectRange(idStr, visible, e.metaKey || e.ctrlKey);
                    return;
                }
            }
            // Cmd (macOS) or Ctrl (other) toggles the node in the multi-
            // select set.
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
            onSelect, onToggleSelect, onSelectRange, selectedId, selectedIds,
            nodeLookup, isRenameableType, scheduleRename, clearRenameTimer,
        ],
    );


    // F2 begins inline rename on the current selection. The listener is
    // bound on the scrolling wrapper (not document) so the shortcut only
    // fires while the user is focused inside the scene tree.
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

    // Commit / cancel forward to the parent controller
    // (useSceneTreeController), which is also responsible for clearing
    // `editingNodeId`.
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

    // id -> parent lookup, used by DnD to resolve same-parent / cross-group
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
    // to the caller -- UXP `onTreeItemClick` `aEvent.detail==2` path.
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
            // Gray-out (disabled) states:
            //  (a) own flag ON but an ancestor hides the row -- the
            //      object/renderer relationship (C++ display loop gates
            //      on the object's flag, so the row's own flag survives).
            //  (b) the row is a member of a hidden group. The group
            //      hide/show cascade rewrites every member's own flag
            //      (OFF on hide, ON on show), so while the group is
            //      hidden each member is "visible once the group is
            //      shown" regardless of its cascaded-off flag -- render
            //      it with the same gray open eye as (a) so the group
            //      relationship reads like the object one.
            const parent = parentLookup(node.id);
            const inHiddenGroup =
                parent?.type === "rendGroup" && !parent.visible;
            const disabledByAncestor =
                (node.visible && !node.effectiveVisible) || inHiddenGroup;
            const eyeIcon =
                node.visible || inHiddenGroup ? "ui.eyeOpen" : "ui.eyeClosed";
            const className =
                "visibility-toggle " +
                (disabledByAncestor
                    ? "disabled"
                    : node.effectiveVisible
                      ? "visible"
                      : "hidden");
            return (
                <Button
                    minimal
                    small
                    icon={<AppIcon name={eyeIcon} aria-hidden />}
                    className={className}
                    aria-disabled={disabledByAncestor || undefined}
                    onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        // Gray-out rows do not toggle: under a hidden
                        // ancestor object the flip would visibly do
                        // nothing, and inside a hidden group it would
                        // desync the member from the group cascade (the
                        // C++ display loop has no group gate, so an ON
                        // member of a hidden group would draw). Deviation
                        // from UXP, which let the click flip the flag.
                        if (disabledByAncestor) return;
                        onToggleVisibility(nodeId);
                    }}
                />
            );
        },
        [onToggleVisibility, parentLookup],
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
                        lineHeight: "var(--row-h)",
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
                icon: <AppIcon name={TYPE_ICON[n.type]} aria-hidden />,
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
            icon: <AppIcon name={TYPE_ICON.scene} aria-hidden />,
            isSelected: isRowSelected(sceneIdStr),
            hasCaret: false,
        };
        return [sceneRow, ...tree.children.map(buildNode)];
    }, [
        tree, expandOverrides, selectedId, selectedIds, visibilityButton,
        onMoveNode, handleDragStart, handleDragOver, handleDrop, handleDragEnd,
        dropIndicator, editingNodeId, commitEdit, cancelEdit,
    ]);

    /**
     * Ids of every row the tree currently draws, in display order --
     * the ordering Shift+click ranges over. Derived from `treeContents`
     * rather than from the scene tree so a collapsed subtree's rows are
     * excluded, matching what the user can actually see and click.
     */
    const visibleRowIds = useMemo<string[]>(() => {
        const ids: string[] = [];
        const walk = (nodes: TreeNodeInfo[]): void => {
            for (const n of nodes) {
                ids.push(String(n.id));
                if (n.isExpanded && n.childNodes) walk(n.childNodes);
            }
        };
        walk(treeContents);
        return ids;
    }, [treeContents]);

    visibleRowIdsRef.current = visibleRowIds;

    return (
        <div className="sp-pane">
            <SectionHeader
                title="Scene"
                titleClassName="scene-name-title"
                alwaysShowChevron
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                actions={
                    <ButtonGroup minimal>
                        <Tooltip content="Add" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.add" aria-hidden />}
                                className="section-action-btn"
                                disabled={!onAddRenderer || !canAdd}
                                onClick={onAddRenderer}
                            />
                        </Tooltip>
                        <Tooltip content="Focus" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.zoomToFit" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canFocus}
                                onClick={() => onFocusSelected?.(selectedId)}
                            />
                        </Tooltip>
                        <Tooltip content="Delete" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.trash" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canDelete}
                                onClick={() => onDeleteSelected?.(selectedId)}
                            />
                        </Tooltip>
                        <Tooltip content="Property" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<AppIcon name="ui.properties" aria-hidden />}
                                className="section-action-btn"
                                disabled={!canProperty}
                                onClick={() => onShowProperty?.(selectedId)}
                            />
                        </Tooltip>
                    </ButtonGroup>
                }
            />
            {!collapsed && tree && treeContents.length > 0 && (
                // tabIndex=-1 keeps the wrapper focusable for the F2
                // keydown shortcut (Blueprint Tree rows are not natively
                // focusable, so the click-target's focus bubbles up here),
                // but removes it from the Tab order so keyboard nav skips
                // it. `outline: none` suppresses the browser default
                // focus ring -- the selected-row background already
                // conveys selection, and the ring rendered around an
                // inner row label looked like a glitch (issue 2026-05-13).
                <div
                    className="sp-pane-scroll"
                    tabIndex={-1}
                    // Marks the tree as the target of Edit > Cut/Copy/Paste
                    // while the user is working here; the handlers are
                    // registered in useSceneTreeController.
                    data-clipboard-scope="scene-tree"
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
                        className="scene-tree h3-listbox-tree"
                    />
                </div>
            )}
        </div>
    );
};

/** Build the display label for a tree row from its node type and name. */
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
