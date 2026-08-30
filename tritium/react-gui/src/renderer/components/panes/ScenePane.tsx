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
import { AppIcon } from "@renderer/h3-kit/primitives";
import type { AppIconKey } from "@renderer/h3-kit/primitives";

import type { SceneNodeType, SceneTreeNode } from "../../worker/shared/sceneTreeTypes";
import { InlineRenameInput } from "./InlineRenameInput";
import { PaneSectionHeader } from "./PaneSectionHeader";
import { useTreeDragDrop } from "./sceneTree/useTreeDragDrop";
import { useVisibilityButton } from "./sceneTree/useVisibilityButton";
import { useTreeKeyboardNav } from "./sceneTree/useTreeKeyboardNav";
import { useSceneTreeState, useSceneTreeActions } from "../../state/sceneTree";

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
    /** Pane-level fold (PaneSectionHeader); unrelated to row expand / collapse. */
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
const ScenePaneComponent: React.FC<ScenePaneProps> = ({
    collapsed,
    onToggleCollapse,
}) => {
    // The tree, the selection and the rename editor come from the provider;
    // the actions are identity-stable, so only the state re-renders the rows.
    const { tree, selectedId, selectedIds, editingNodeId, selectedHasOps: opsEnabled } = useSceneTreeState();
    const {
        select: onSelect,
        toggleSelect: onToggleSelect,
        selectRange: onSelectRange,
        toggleVisibility: onToggleVisibility,
        addSelected: onAddRenderer,
        deleteSelected: onDeleteSelected,
        focusSelected: onFocusSelected,
        showProperty: onShowProperty,
        nodeDoubleClick: onNodeDoubleClick,
        beginInlineRename: onBeginInlineRename,
        cancelInlineRename: onCancelInlineRename,
        commitInlineRename: onCommitInlineRename,
        showContextMenu: onShowContextMenu,
        moveNode: onMoveNode,
        nodeExpandChange: onNodeExpandChange,
    } = useSceneTreeActions();
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

    /**
     * Open / close one row: the local override the tree renders from, plus
     * the persistence callback. The twisty and the arrow keys both go
     * through here so they cannot diverge.
     */
    const setNodeExpanded = useCallback((idStr: string, expanded: boolean) => {
        setExpandOverrides((prev) => {
            const next = new Map(prev);
            next.set(idStr, expanded);
            return next;
        });
        const sceneNode = nodeLookup.get(idStr);
        if (sceneNode) expandChangeRef.current?.(sceneNode, !expanded);
    }, [nodeLookup]);

    /** Whether a row is currently open (override, else the C++ hint). */
    const isNodeExpanded = useCallback((idStr: string): boolean => {
        const ovr = expandOverrides.get(idStr);
        if (ovr !== undefined) return ovr;
        return !(nodeLookup.get(idStr)?.uiCollapsed ?? false);
    }, [expandOverrides, nodeLookup]);

    const handleNodeExpand = useCallback((node: TreeNodeInfo) => {
        setNodeExpanded(String(node.id), true);
    }, [setNodeExpanded]);

    const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
        setNodeExpanded(String(node.id), false);
    }, [setNodeExpanded]);

    // Visible-row order for Shift+click, kept in a ref because the handler
    // below is declared before `treeContents` (which it is derived from).
    const visibleRowIdsRef = useRef<string[]>([]);
    /** Scrolling wrapper, so key navigation can bring a row into view. */
    const treeScrollRef = useRef<HTMLDivElement | null>(null);

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
    const {
        dropIndicator, parentLookup, parentMap,
        handleDragStart, handleDragOver, handleDrop, handleDragEnd, handleTreeDragLeave,
    } = useTreeDragDrop({ tree, nodeLookup, onMoveNode });

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

    const visibilityButton = useVisibilityButton({ onToggleVisibility, parentLookup });

    const treeContents: TreeNodeInfo[] = useMemo(() => {
        if (!tree) return [];

        // Override wins (true=expanded, false=collapsed); otherwise the
        // uiCollapsed hint from C++ / the synthesized roots (cameraRoot /
        // styleRoot ship uiCollapsed=true so they start closed).
        const isExpanded = (_n: SceneTreeNode, idStr: string): boolean =>
            isNodeExpanded(idStr);

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
        tree, isNodeExpanded, selectedId, selectedIds, visibilityButton,
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

    /**
     * Arrow / Home / End selection movement, shared with every other list in
     * the app (h3-kit/list). Declared after `visibleRowIds` because it
     * navigates the rows as displayed -- collapsed children are skipped
     * exactly as they are on screen.
     */
    const handleTreeKeyDown = useTreeKeyboardNav({
        visibleRowIds, selectedId, editingNodeId, nodeLookup, parentMap, treeScrollRef,
        onSelect, onSelectRange, onDeleteSelected, canDelete, isRenameableType,
        setNodeExpanded, isNodeExpanded, beginRenameRef,
    });

    return (
        <div className="sp-pane">
            <PaneSectionHeader
                title="Scene"
                icon="ui.tree"
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
                    ref={treeScrollRef}
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

/**
 * Its two props are the pane-level fold; the tree and the selection come
 * from the provider. The actions bundle is identity-stable, so a click
 * re-renders the rows through the state context alone.
 */
export const ScenePane = React.memo(ScenePaneComponent)
ScenePane.displayName = 'ScenePane'
