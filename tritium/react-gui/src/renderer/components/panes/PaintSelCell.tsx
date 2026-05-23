/**
 * @file components/panes/PaintSelCell.tsx
 * @description Inline-edit wrapper around `MolSelList` for the Paint
 * coloring table.
 *
 * Replaces the plain `<input>` used in the selection column with a full
 * `MolSelList` (free-text InputGroup + dropdown picker with preset /
 * history / scene-def / global-def optgroups). The wrapper preserves the
 * Paint table's existing blur-commit semantics:
 *
 *   - Keystrokes update a local `draft` state only; the worker is not
 *     touched until the user moves focus out of the cell.
 *   - Focus shifts *within* the cell (e.g. clicking the picker chevron
 *     while the input is focused) must NOT commit -- otherwise an
 *     in-progress edit would be flushed with the stale draft before the
 *     picker selection has updated it. We detect this by checking
 *     whether the blur's `relatedTarget` is contained in the cell.
 *   - Enter on the input commits and blurs (matches the other inline
 *     editors); Enter on the native `<select>` is left to the browser so
 *     it keeps the OS dropdown behaviour.
 *   - Successful commits push the value to the shared selection history
 *     (same store the `MolSelList` picker reads from).
 */

import React, { useEffect, useState } from 'react'
import { MolSelList, pushHistory } from '../widgets/MolSelList'

export interface PaintSelCellProps {
    sceneID: number
    /** Parent molecule uid; enables the picker's "current (<sel>)" preset. */
    molID?: number
    value: string
    /**
     * Called once the user finishes editing (blur outside the cell, or
     * Enter on the input). `next` may equal `value`, in which case the
     * caller may decide to no-op.
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
    // (event-driven refetch). Mirrors the local-buffer reset logic in
    // PaintTable's parent-level draft state.
    useEffect(() => {
        setDraft(value)
    }, [value])

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
        // Blur into a sibling inside the cell (typically the picker
        // <select>) is not a real exit -- ignore so the in-progress draft
        // is not committed prematurely.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        if (draft === value) return
        onCommit(draft)
        pushHistory(draft)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
        if (e.key !== 'Enter') return
        const t = e.target as HTMLElement
        // Let the native <select> handle Enter (open the dropdown / pick).
        if (t.tagName !== 'INPUT') return
        t.blur()
    }

    return (
        <div
            className="color-paint-sel-cell"
            onBlur={handleBlur}
            onFocus={onFocus}
            onKeyDown={handleKeyDown}
        >
            <MolSelList
                sceneID={sceneID}
                molID={molID}
                selectedSel={draft}
                onSelectedSelChange={setDraft}
                refreshKey={refreshKey}
                fill
            />
        </div>
    )
}
