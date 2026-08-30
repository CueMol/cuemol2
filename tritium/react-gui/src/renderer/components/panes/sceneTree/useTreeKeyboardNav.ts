/**
 * @file components/panes/sceneTree/useTreeKeyboardNav.ts
 * @description Keyboard handling for the scene tree.
 *
 * Two layers. `useListKeyNav` walks the visible rows; on top of it the tree
 * adds what a tree needs -- Right opens a closed row before stepping into it,
 * Left closes an open one before stepping out to the parent -- plus Delete and
 * the rename key.
 *
 * The Delete branch is gated on `editingNodeId`: without that, a Backspace
 * meant for the rename input reached this handler and removed the node the
 * user was renaming.
 */

import { useCallback } from 'react';
import { scrollRowIntoView, useListKeyNav } from '@renderer/h3-kit/list';
import type { SceneNodeType, SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes';

export interface UseTreeKeyboardNavOptions {
    /** Ids of every drawn row, in display order. */
    visibleRowIds: string[];
    selectedId: string;
    editingNodeId: string | null;
    nodeLookup: Map<string, SceneTreeNode>;
    parentMap: Map<number, SceneTreeNode>;
    /** Scrolling wrapper, so a keyboard move can bring a row into view. */
    treeScrollRef: React.RefObject<HTMLDivElement | null>;
    onSelect: (id: string) => void;
    onSelectRange?: (id: string, items: string[], additive: boolean) => void;
    onDeleteSelected?: (id: string) => void;
    canDelete: boolean;
    /** Whether a node type may be renamed in place. */
    isRenameableType: (t: SceneNodeType) => boolean;
    /** Opens / closes a row; Right and Left drive it before stepping. */
    setNodeExpanded: (id: string, expanded: boolean) => void;
    isNodeExpanded: (id: string) => boolean;
    /** Starts the inline rename, read through a ref so this stays stable. */
    beginRenameRef: React.MutableRefObject<(id: string) => void>;
}

export function useTreeKeyboardNav({
    visibleRowIds, selectedId, editingNodeId, nodeLookup, parentMap, treeScrollRef,
    onSelect, onSelectRange, onDeleteSelected, canDelete, isRenameableType,
    setNodeExpanded, isNodeExpanded, beginRenameRef,
}: UseTreeKeyboardNavOptions) {
    const navKeyDown = useListKeyNav({
        items: visibleRowIds,
        activeId: selectedId || null,
        onSelect,
        onSelectRange: onSelectRange
            ? (id, items, additive) => onSelectRange(id, [...items], additive)
            : undefined,
        // Right opens a closed row, then steps into it; Left closes an open
        // one, then steps out to the parent -- the usual tree behaviour.
        onExpand: (id) => {
            const node = nodeLookup.get(id);
            if (!node || node.children.length === 0) return;
            if (!isNodeExpanded(id)) {
                setNodeExpanded(id, true);
                return;
            }
            onSelect(String(node.children[0].id));
        },
        onCollapse: (id) => {
            const node = nodeLookup.get(id);
            if (node && node.children.length > 0 && isNodeExpanded(id)) {
                setNodeExpanded(id, false);
                return;
            }
            const parent = node ? parentMap.get(node.id) : null;
            if (parent) onSelect(String(parent.id));
        },
        // Keep the moved-to row on screen: without this the selection could
        // walk out of the scroll viewport and leave the user looking at rows
        // that are no longer selected.
        onScrollTo: (id) => {
            scrollRowIntoView(treeScrollRef.current, `[data-node-id="${id}"]`);
        },
        // An open inline editor owns the keyboard.
        enabled: editingNodeId == null,
    });

    // Keys the tree owns beyond navigation: F2 renames, Delete removes. The
    // listener is bound on the scrolling wrapper (not document) so they only
    // fire while the user is focused inside the scene tree.
    const handleTreeKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            // The inline rename editor is an <input> inside this wrapper, so
            // everything typed into it bubbles to this handler. While it is
            // open the tree owns no keys: Backspace there means "delete a
            // character", not "delete the node".
            if (editingNodeId != null) return;
            if (navKeyDown(e)) return;
            // Delete / Backspace removes the selection. `onDeleteSelected`
            // is the same handler the toolbar button uses, so it deletes the
            // whole multi-selection under one undo transaction.
            if (e.key === "Delete" || e.key === "Backspace") {
                if (!onDeleteSelected || !canDelete) return;
                e.preventDefault();
                onDeleteSelected(selectedId);
                return;
            }
            if (e.key !== "F2") return;
            if (!beginRenameRef.current) return;
            if (!selectedId) return;
            const node = nodeLookup.get(selectedId);
            if (!node) return;
            if (!isRenameableType(node.type)) return;
            e.preventDefault();
            beginRenameRef.current(selectedId);
        },
        [
            navKeyDown, selectedId, nodeLookup, isRenameableType,
            onDeleteSelected, canDelete, editingNodeId, beginRenameRef,
        ],
    );

    return handleTreeKeyDown;
}
