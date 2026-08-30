/**
 * @file hooks/useTabDragDrop.ts
 * @description Custom hook encapsulating HTML5 Drag and Drop logic for tab
 * reordering.
 *
 * ## Design decisions
 *
 * - The dragged-tab id is stored in a **ref** (not state) so that the
 *   `onDragStart` handler does not trigger a re-render -- which would
 *   cancel the browser's native drag initialisation in Chromium/Electron.
 *
 * - The visual drop indicator (`dropTarget`) is the only piece of React
 *   state managed here.  It drives the `drag-over-left` / `drag-over-right`
 *   CSS classes on the target tab.
 *
 * - All handlers are memoised with `useCallback` and depend only on the
 *   `onReorderTabs` callback (or the `tabs` array for the container
 *   fallback).  This keeps re-renders to a minimum.
 *
 * @module useTabDragDrop
 */

import { useCallback, useRef, useState } from "react";
import type { TabData } from "@renderer/types";

// --- Types ---

/** Which side of a tab the drop indicator should appear on. */
export type DropSide = "left" | "right";

/** Current drop-indicator position. `null` when no drag is active. */
export interface DropTarget {
  id: string;
  side: DropSide;
}

/** Signature of the reorder callback passed down from the parent. */
export type ReorderHandler = (
  fromId: string,
  toId: string,
  insertAfter: boolean,
) => void;

/** Return value of `useTabDragDrop`. */
export interface TabDragDropAPI {
  /** Current drop-indicator target (drives CSS classes). */
  dropTarget: DropTarget | null;

  /** Attach to `onDragStart` on each tab element. */
  handleDragStart: (e: React.DragEvent<HTMLDivElement>, tabId: string) => void;

  /** Attach to `onDragOver` on each tab element. */
  handleDragOver: (e: React.DragEvent<HTMLDivElement>, tabId: string) => void;

  /** Attach to `onDragLeave` on each tab element. */
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;

  /** Attach to `onDrop` on each tab element. */
  handleDrop: (e: React.DragEvent<HTMLDivElement>, targetId: string) => void;

  /** Attach to `onDragEnd` on the dragged tab element. */
  handleDragEnd: () => void;

  /** Attach to `onDragOver` on the scroll container. */
  handleContainerDragOver: (e: React.DragEvent<HTMLDivElement>) => void;

  /** Attach to `onDrop` on the scroll container (gap / end-of-bar). */
  handleContainerDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}

// --- Hook ---

/**
 * Encapsulates all HTML5 Drag and Drop state and event handlers needed
 * to reorder tabs inside a tab bar.
 *
 * @param tabs           - Current ordered list of tabs (needed for the
 *                         container-drop fallback that moves to the end).
 * @param onReorderTabs  - Callback that performs the actual reorder in
 *                         the parent's state.  May be `undefined` to
 *                         disable reordering entirely.
 */
export function useTabDragDrop(
  tabs: TabData[],
  onReorderTabs?: ReorderHandler,
): TabDragDropAPI {
  // The dragged tab id is kept in a ref to avoid re-renders during
  // dragStart (which would cancel the native drag in Chromium).
  const draggedIdRef = useRef<string | null>(null);

  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // --- Per-tab handlers ---

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, tabId: string) => {
      draggedIdRef.current = tabId;

      // text/plain for maximum Chromium / Electron compatibility.
      e.dataTransfer.setData("text/plain", tabId);
      e.dataTransfer.effectAllowed = "move";

      // Apply the dragging visual with a micro-delay so the browser
      // captures the element's *original* appearance for the ghost.
      requestAnimationFrame(() => {
        const el = e.target as HTMLElement;
        el.closest?.(".tab")?.classList.add("dragging");
      });
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, tabId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      if (draggedIdRef.current === tabId) {
        setDropTarget(null);
        return;
      }

      // Determine which half of the tab the cursor is in.
      const rect = e.currentTarget.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const side: DropSide = e.clientX < midX ? "left" : "right";

      setDropTarget((prev) => {
        if (prev && prev.id === tabId && prev.side === side) return prev;
        return { id: tabId, side };
      });
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only clear when leaving the tab entirely -- ignore moves between
      // child elements (icon, title, close button) within the same tab.
      const related = e.relatedTarget as Node | null;
      if (
        related &&
        e.currentTarget instanceof HTMLElement &&
        e.currentTarget.contains(related)
      ) {
        return;
      }
      setDropTarget(null);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent the container handler from also firing.

      const sourceId = draggedIdRef.current;
      if (sourceId && sourceId !== targetId && onReorderTabs) {
        const rect = e.currentTarget.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const insertAfter = e.clientX >= midX;

        onReorderTabs(sourceId, targetId, insertAfter);
      }

      draggedIdRef.current = null;
      setDropTarget(null);
    },
    [onReorderTabs],
  );

  const handleDragEnd = useCallback(() => {
    document
      .querySelectorAll(".tab.dragging")
      .forEach((el) => el.classList.remove("dragging"));

    draggedIdRef.current = null;
    setDropTarget(null);
  }, []);

  // --- Container-level handlers ---

  const handleContainerDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [],
  );

  /**
   * Fallback drop handler on the scroll container.
   * Fires when the cursor is released in a gap between tabs or past the
   * last tab.  Moves the dragged tab to the end of the list.
   */
  const handleContainerDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();

      const sourceId = draggedIdRef.current;
      if (sourceId && tabs.length > 0 && onReorderTabs) {
        const lastTab = tabs[tabs.length - 1];
        if (sourceId !== lastTab.id) {
          onReorderTabs(sourceId, lastTab.id, true);
        }
      }

      draggedIdRef.current = null;
      setDropTarget(null);
    },
    [tabs, onReorderTabs],
  );

  return {
    dropTarget,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    handleContainerDragOver,
    handleContainerDrop,
  };
}
