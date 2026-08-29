/**
 * @file h3-kit/list/useListKeyNav.ts
 * @description Keyboard navigation for a selectable list, in one place.
 *
 * Every list-shaped surface in the app -- the scene tree, the paint deck, any
 * future Listbox -- owes the user the same keys, and each one growing its own
 * handler is how they end up differing. This hook is that contract: it knows
 * nothing about what the rows are, only their order on screen and how to
 * select them.
 *
 * Keys handled (a superset of the platform listbox convention):
 *
 * | key                | effect                                        |
 * |--------------------|-----------------------------------------------|
 * | Up / Down          | move the selection one row                    |
 * | Home / End         | jump to the first / last row                  |
 * | Shift + the above  | extend the selection from the anchor          |
 * | Shift+Cmd/Ctrl + " | extend, unioning with the current selection    |
 * | Left / Right       | collapse / expand (tree lists only, optional) |
 *
 * With nothing selected, Up / Down / Home / End all land on an end of the
 * list, so the keyboard alone can enter the list.
 *
 * Selection has two cursors, as every platform listbox does: the ANCHOR that
 * a range is measured from (the caller owns it -- a plain click moves it) and
 * the LEAD that Shift+Arrow walks. Holding Shift+Down therefore grows the
 * range one row at a time instead of re-measuring from the anchor and
 * standing still at two rows. The lead is kept here, and snaps back to the
 * anchor whenever the caller changes it.
 *
 * The handler returns whether it consumed the event, so a caller can keep its
 * own bindings (F2, Delete) and only fall through when this one passes.
 */

import { useCallback, useRef } from 'react';

/**
 * Bring a row into view, addressed by a selector inside its scroll container.
 *
 * Wraps the `scrollIntoView` call because it is not universally available:
 * jsdom has no layout and does not implement it, so calling it unguarded
 * turns a keyboard test into an uncaught TypeError.
 *
 * @param container - the scrolling element, or null before it mounts.
 * @param selector - CSS selector for the row inside it.
 */
export function scrollRowIntoView(
    container: HTMLElement | null,
    selector: string,
): void {
    const el = container?.querySelector(selector);
    if (el instanceof HTMLElement && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
    }
}

export interface ListKeyNavOptions {
    /**
     * Row ids in the order they are displayed. For a tree this is the
     * flattened list of currently visible rows, so collapsed children are
     * skipped exactly as they are on screen.
     */
    items: readonly string[];
    /** The anchor / primary row, or null when nothing is selected. */
    activeId: string | null;
    /** Replace the selection with a single row. */
    onSelect: (id: string) => void;
    /**
     * Extend the selection from the anchor to `id` (Shift). `additive` unions
     * with the existing selection instead of replacing it (Shift+Cmd/Ctrl).
     * When omitted, Shift behaves like a plain move.
     */
    onSelectRange?: (id: string, items: readonly string[], additive: boolean) => void;
    /** Tree lists: collapse the active row (Left), else move to its parent. */
    onCollapse?: (id: string) => void;
    /** Tree lists: expand the active row (Right). */
    onExpand?: (id: string) => void;
    /**
     * Bring a row into view after the selection moves. Without it a long list
     * can move the selection off screen.
     */
    onScrollTo?: (id: string) => void;
    /** False while another control owns the keys (e.g. an inline rename). */
    enabled?: boolean;
}

/** Index the navigation starts from, or -1 when the cursor is not in the list. */
function indexOf(items: readonly string[], id: string | null): number {
    return id === null ? -1 : items.indexOf(id);
}

/**
 * Build the keydown handler.
 *
 * @returns `(event) => boolean` -- true when the key was consumed (the event
 *   is already `preventDefault()`ed), false when the caller should handle it.
 */
export function useListKeyNav(opts: ListKeyNavOptions): (
    e: React.KeyboardEvent,
) => boolean {
    const {
        items, activeId, onSelect, onSelectRange, onCollapse, onExpand,
        onScrollTo, enabled = true,
    } = opts;

    // The lead follows the caller's anchor until Shift+Arrow moves it. Reset
    // on an anchor change (a click) so the next Shift range starts fresh.
    const leadRef = useRef<string | null>(activeId);
    const prevActiveRef = useRef<string | null>(activeId);
    if (prevActiveRef.current !== activeId) {
        prevActiveRef.current = activeId;
        leadRef.current = activeId;
    }

    return useCallback(
        (e: React.KeyboardEvent): boolean => {
            if (!enabled || items.length === 0) return false;
            // A modified arrow is a different gesture (word-wise caret motion,
            // window management); only Shift and Shift+Cmd/Ctrl are ours.
            if (e.altKey) return false;

            // Walk from the lead; fall back to the anchor when the lead has
            // gone (the list changed under it).
            const lead = indexOf(items, leadRef.current);
            const cur = lead >= 0 ? lead : indexOf(items, activeId);
            let next: number | null = null;

            switch (e.key) {
                case 'ArrowDown':
                    next = cur < 0 ? 0 : Math.min(cur + 1, items.length - 1);
                    break;
                case 'ArrowUp':
                    next = cur < 0 ? items.length - 1 : Math.max(cur - 1, 0);
                    break;
                case 'Home':
                    next = 0;
                    break;
                case 'End':
                    next = items.length - 1;
                    break;
                case 'ArrowRight':
                    if (!onExpand || activeId === null || e.shiftKey) return false;
                    e.preventDefault();
                    onExpand(activeId);
                    return true;
                case 'ArrowLeft':
                    if (!onCollapse || activeId === null || e.shiftKey) return false;
                    e.preventDefault();
                    onCollapse(activeId);
                    return true;
                default:
                    return false;
            }

            // Plain Cmd/Ctrl + arrow is a system gesture, not a list move.
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey) return false;

            e.preventDefault();
            const id = items[next];
            leadRef.current = id;
            if (e.shiftKey && onSelectRange && activeId !== null) {
                onSelectRange(id, items, e.metaKey || e.ctrlKey);
            } else {
                onSelect(id);
                // A plain move re-anchors; the caller's onSelect does that for
                // the selection, and this keeps the lead in step even before
                // the new activeId arrives on the next render.
                prevActiveRef.current = id;
            }
            onScrollTo?.(id);
            return true;
        },
        [items, activeId, onSelect, onSelectRange, onCollapse, onExpand, onScrollTo, enabled],
    );
}
