/**
 * @file features/scene/sceneTree/useTreeDragDrop.ts
 * @description Dragging a scene-tree row onto another one.
 *
 * The drop indicator is only set once `planSceneNodeMove` has accepted the
 * (source, target, orientation) combination, so the line never appears where
 * a drop would be refused -- what the user sees and what the drop does cannot
 * disagree.
 *
 * `dragSourceRef` carries the dragged node through the dragover phase, where
 * the browser makes `dataTransfer.getData` unreadable; the MIME payload is
 * still written so a drop can validate itself independently.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes';
import type { MoveSceneNodeArgs } from '@renderer/features/scene/sceneTreeDnd';
import {
    SCENE_NODE_MIME,
    computeOri,
    planSceneNodeMove,
    type DragOri,
    type DragSourcePayload,
} from '@renderer/features/scene/sceneTreeDnd';

export interface UseTreeDragDropOptions {
    tree: SceneTreeNode | null;
    /** id -> node, so a Blueprint TreeNodeInfo can be resolved back. */
    nodeLookup: Map<string, SceneTreeNode>;
    /** Commits an accepted move. Absent means rows are not draggable. */
    onMoveNode?: (args: MoveSceneNodeArgs) => unknown;
}

export function useTreeDragDrop({
    tree, nodeLookup, onMoveNode,
}: UseTreeDragDropOptions) {
    // Mid-drag drop indicator: the row id currently hovered plus the resolved
    // orientation. See the file header for why it is gated on the plan.
    const [dropIndicator, setDropIndicator] =
        useState<{ id: string; ori: DragOri } | null>(null);
    const dragSourceRef = useRef<SceneTreeNode | null>(null);

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

    return {
        dropIndicator,
        parentLookup,
        parentMap,
        handleDragStart,
        handleDragOver,
        handleDrop,
        handleDragEnd,
        handleTreeDragLeave,
    };
}
