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

import React, { useState, useCallback, useMemo } from "react";
import {
    Icon,
    Tree,
    Button,
    ButtonGroup,
    Tooltip,
    type IconName,
    type TreeNodeInfo,
} from "@blueprintjs/core";

import type { SceneNodeType, SceneTreeNode } from "../../worker/shared/sceneTreeTypes";

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
    onSelect: (id: string) => void;
    onToggleVisibility: (id: string) => void;
    onAddObject?: () => void;
    onAddRenderer?: () => void;
    onDeleteSelected?: (id: string) => void;
    onFocusSelected?: (id: string) => void;
    onShowProperty?: (id: string) => void;
    /** Right-click handler — opens native context menu for the targeted node. */
    onShowContextMenu?: (node: SceneTreeNode, x: number, y: number) => void;
    /**
     * Per-action enablement for the current selection. When omitted, all
     * actions are enabled (legacy callers). Defaults to enabled=true so a
     * caller that does not yet compute this still works.
     */
    opsEnabled?: { focus: boolean; delete: boolean; property: boolean };
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/* ─── Component ─── */

export const ScenePane: React.FC<ScenePaneProps> = ({
    tree,
    selectedId,
    onSelect,
    onToggleVisibility,
    onAddRenderer,
    onDeleteSelected,
    onFocusSelected,
    onShowProperty,
    onShowContextMenu,
    opsEnabled,
    collapsed,
    onToggleCollapse,
}) => {
    const hasSelection = selectedId !== '';
    const canFocus = hasSelection && (opsEnabled?.focus ?? true);
    const canDelete = hasSelection && (opsEnabled?.delete ?? true);
    const canProperty = hasSelection && (opsEnabled?.property ?? true);
    // Tracks tree rows the user has explicitly collapsed.  The scene root
    // defaults to expanded; cameraRoot / styleRoot default to collapsed
    // (their `uiCollapsed` hint is true).
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

    const handleNodeExpand = useCallback((node: TreeNodeInfo) => {
        setCollapsedIds((prev) => {
            const next = new Set(prev);
            next.delete(String(node.id));
            return next;
        });
    }, []);

    const handleNodeCollapse = useCallback((node: TreeNodeInfo) => {
        setCollapsedIds((prev) => new Set(prev).add(String(node.id)));
    }, []);

    const handleNodeClick = useCallback(
        (node: TreeNodeInfo) => {
            onSelect(String(node.id));
        },
        [onSelect],
    );

    // Build an id → SceneTreeNode lookup so onNodeContextMenu (which only
    // receives the Blueprint TreeNodeInfo) can resolve back to the original
    // typed node and forward it to the caller.
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

    const handleNodeContextMenu = useCallback(
        (node: TreeNodeInfo, _path: number[], e: React.MouseEvent<HTMLElement>) => {
            if (!onShowContextMenu) return;
            const sceneNode = nodeLookup.get(String(node.id));
            if (!sceneNode) return;
            e.preventDefault();
            // Select the right-clicked row so subsequent toolbar / dialog
            // actions act on it; matches UXP behaviour.
            onSelect(String(node.id));
            onShowContextMenu(sceneNode, e.clientX, e.clientY);
        },
        [nodeLookup, onShowContextMenu, onSelect],
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
            // User override wins.
            if (collapsedIds.has(idStr)) return false;
            // Default: respect uiCollapsed hint from C++ / synthesized roots.
            // (cameraRoot / styleRoot ship uiCollapsed=true so they start closed.)
            return !n.uiCollapsed;
        };

        const buildNode = (n: SceneTreeNode): TreeNodeInfo => {
            const idStr = String(n.id);
            const hasChildren = n.children.length > 0;
            return {
                id: idStr,
                label: nodeLabel(n),
                icon: TYPE_ICON[n.type],
                isExpanded: hasChildren && isExpanded(n, idStr),
                isSelected: selectedId === idStr,
                secondaryLabel: visibilityButton(idStr, n),
                hasCaret: hasChildren,
                childNodes: hasChildren ? n.children.map(buildNode) : undefined,
            };
        };

        // UXP layout: scene row + objects + cameraRoot + styleRoot are ALL
        // siblings at depth 0. The scene row itself is a leaf (no children).
        const sceneIdStr = String(tree.id);
        const sceneRow: TreeNodeInfo = {
            id: sceneIdStr,
            label: nodeLabel(tree),
            icon: TYPE_ICON.scene,
            isSelected: selectedId === sceneIdStr,
            hasCaret: false,
        };
        return [sceneRow, ...tree.children.map(buildNode)];
    }, [tree, collapsedIds, selectedId, visibilityButton]);

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
                        <Tooltip content="Add Renderer" placement="bottom" compact>
                            <Button
                                minimal
                                small
                                icon={<Icon icon="style" size={14} />}
                                className="section-action-btn"
                                disabled={!onAddRenderer}
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
                <div className="sp-pane-scroll">
                    <Tree
                        contents={treeContents}
                        onNodeClick={handleNodeClick}
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
