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
    onMoveNode,
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
            // dataTransfer.getData is unavailable on dragover (privacy);
            // we still call planSceneNodeMove with the target only by
            // optimistically accepting the drop. The drop handler does
            // strict validation.
            const types = e.dataTransfer.types;
            if (!Array.from(types).includes(SCENE_NODE_MIME)) return;
            // Allow the drop so the browser displays a "move" cursor.
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            void node;
        },
        [onMoveNode],
    );

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLSpanElement>, target: SceneTreeNode) => {
            if (!onMoveNode) return;
            const src = readDragSource(e);
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

        const draggable =
            (n: SceneTreeNode): boolean =>
                n.type === "object" ||
                n.type === "renderer" ||
                n.type === "rendGroup";

        const wrapLabel = (n: SceneTreeNode): string | React.JSX.Element => {
            const text = nodeLabel(n);
            if (!onMoveNode) return text;
            return (
                <span
                    draggable={draggable(n)}
                    onDragStart={(e) => handleDragStart(e, n)}
                    onDragOver={(e) => handleDragOver(e, n)}
                    onDrop={(e) => handleDrop(e, n)}
                    data-node-id={String(n.id)}
                    style={{ display: "inline-block", cursor: draggable(n) ? "grab" : "default" }}
                >
                    {text}
                </span>
            );
        };

        const buildNode = (n: SceneTreeNode): TreeNodeInfo => {
            const idStr = String(n.id);
            const hasChildren = n.children.length > 0;
            return {
                id: idStr,
                label: wrapLabel(n),
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
    }, [tree, collapsedIds, selectedId, visibilityButton, onMoveNode, handleDragStart, handleDragOver, handleDrop]);

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
