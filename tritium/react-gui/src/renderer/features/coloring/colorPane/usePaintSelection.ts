/**
 * @file components/panes/colorPane/usePaintSelection.ts
 * @description Row selection for the Paint table.
 *
 * Two pieces of state, because the operations split in two. `selectedRow` is
 * the anchor: the single-target operations (Add's insert point, Move up/down)
 * act on it, and a Shift+click ranges from it. `selectedRows` is the whole
 * selection the multi-target operations (Delete, Cut, Copy, the paste anchor)
 * act on, and it always contains the anchor while anything is selected.
 */

import { useCallback, useState } from 'react';

export interface PaintSelection {
    /** Anchor / primary row; null when nothing is selected. */
    selectedRow: number | null;
    /** Every selected row. Contains `selectedRow` unless empty. */
    selectedRows: Set<number>;
    /** Replace the selection with a single row (or clear it with null). */
    setSelectedRow: (idx: number | null) => void;
    /** Cmd/Ctrl+click: toggle one row in the selection. */
    toggleSelectedRow: (idx: number) => void;
    /** Shift+click: select the range between the anchor and `idx`. */
    selectRowRange: (idx: number, additive: boolean) => void;
}

export function usePaintSelection(): PaintSelection {
    // `selectedRow` is the anchor / primary row: it drives the single-target
    // operations (Add insert point, Move up/down) and is the origin a
    // Shift+click ranges from. `selectedRows` is the full selection the
    // multi-target operations (Delete, Cut, Copy, paste anchor) act on; it
    // always contains `selectedRow` while anything is selected.
    const [selectedRow, setSelectedRowState] = useState<number | null>(null)
    const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set())

    /** Replace the selection with a single row (or clear it with null). */
    const setSelectedRow = useCallback((idx: number | null) => {
        setSelectedRowState(idx)
        setSelectedRows(idx === null ? new Set() : new Set([idx]))
    }, [])

    /** Cmd/Ctrl+click: toggle one row in the selection. */
    const toggleSelectedRow = useCallback((idx: number) => {
        setSelectedRows((prev) => {
            const next = new Set(prev)
            if (next.has(idx)) next.delete(idx)
            else next.add(idx)
            setSelectedRowState(next.size === 0 ? null : idx)
            return next
        })
    }, [])

    /**
     * Shift+click: select the range between the anchor and `idx`.
     *
     * The anchor stays put so repeated Shift+clicks re-extend from the same
     * origin (Finder parity, matching the scene tree's `selectRangeTo`).
     */
    const selectRowRange = useCallback((idx: number, additive: boolean) => {
        setSelectedRowState((anchor) => {
            if (anchor === null) {
                setSelectedRows(new Set([idx]))
                return idx
            }
            const [lo, hi] = anchor <= idx ? [anchor, idx] : [idx, anchor]
            const range: number[] = []
            for (let i = lo; i <= hi; ++i) range.push(i)
            setSelectedRows((prev) =>
                additive ? new Set([...prev, ...range]) : new Set(range),
            )
            return anchor
        })
    }, [])

    return { selectedRow, selectedRows, setSelectedRow, toggleSelectedRow, selectRowRange };
}
