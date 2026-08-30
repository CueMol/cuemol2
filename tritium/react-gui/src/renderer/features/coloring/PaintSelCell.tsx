/**
 * @file components/panes/PaintSelCell.tsx
 * @description Inline-edit wrapper around `MolSelList` for the Paint
 * coloring table.
 *
 * Replaces the plain `<input>` used in the selection column with a full
 * `MolSelList` (free-text InputGroup + caret button opening a Named/History
 * picker popover).
 *
 * Commit semantics are owned by `MolSelList`, which fires `onCommit` for
 * BOTH of the ways a selection is finalised:
 *   - the free-text input losing focus (blur), and
 *   - picking an entry from the Named/History popover.
 *
 * Keystrokes only update the local `draft` (via `onSelectedSelChange`); the
 * worker is not touched until one of the commit events above. We de-duplicate
 * against the last-known `value` so an unchanged blur (e.g. opening the
 * picker without editing) neither spams the worker nor pollutes the shared
 * selection history.
 *
 * @remarks An earlier version committed only from a wrapper-level blur handler
 * that deliberately ignored focus moving into the popover portal -- which meant
 * a value chosen from the picker was never committed (the scene kept the old
 * selection). Delegating to `MolSelList.onCommit` fixes that.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { MolSelList, pushHistory } from '@renderer/h3-kit/MolSelList'

export interface PaintSelCellProps {
    sceneID: number
    /** Parent molecule uid; enables the picker's "current (<sel>)" preset. */
    molID?: number
    value: string
    /**
     * Called once the user finishes editing (input blur or popover pick).
     * `next` always differs from the current `value` (unchanged commits are
     * filtered out here).
     */
    onCommit: (next: string) => void
    /** Fired when any focusable child gains focus (row-select hook). */
    onFocus?: () => void
    /**
     * Bumped by the parent to force MolSelList to re-fetch its named
     * selection defs (forwarded as-is).
     */
    refreshKey?: number
}

export const PaintSelCell: React.FC<PaintSelCellProps> = ({
    sceneID,
    molID,
    value,
    onCommit,
    onFocus,
    refreshKey,
}) => {
    const [draft, setDraft] = useState(value)
    // Re-sync when the underlying entry value changes underneath us
    // (event-driven refetch).
    useEffect(() => {
        setDraft(value)
    }, [value])

    const handleCommit = useCallback(
        (next: string): void => {
            // Skip no-op commits (e.g. blurring the field without editing, or
            // re-picking the current value) so the worker and the selection
            // history are only touched on real changes.
            if (next === value) return
            onCommit(next)
            pushHistory(next)
        },
        [onCommit, value],
    )

    return (
        <div className="color-paint-sel-cell" onFocus={onFocus}>
            <MolSelList
                sceneID={sceneID}
                molID={molID}
                selectedSel={draft}
                onSelectedSelChange={setDraft}
                onCommit={handleCommit}
                refreshKey={refreshKey}
                showSelectionIcon={false}
                fill
            />
        </div>
    )
}
