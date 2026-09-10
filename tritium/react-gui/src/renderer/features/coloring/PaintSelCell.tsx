/**
 * @file features/coloring/PaintSelCell.tsx
 * @description Inline-edit wrapper around `MolSelList` for the Paint
 * coloring table.
 *
 * Replaces the plain `<input>` used in the selection column with a full
 * `MolSelList` (free-text InputGroup + caret button opening a Named/History
 * picker popover).
 *
 * The table mounts this only for the cell being edited (ui-style-guide,
 * "listbox: 行の編集モード"), so it opens focused and reports when the user
 * deliberately finishes -- `onDone` on Enter, `onCancel` on Escape -- and the
 * table goes back to showing plain text. A commit is NOT a finish: the field
 * commits on blur, and blur is also what happens when the user reaches for
 * its chevron.
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
    /**
     * Bumped by the parent to force MolSelList to re-fetch its named
     * selection defs (forwarded as-is).
     */
    refreshKey?: number
    /** Focus the input on mount -- the cell is mounted to be edited. */
    autoFocus?: boolean
    /** Open the builder popover on mount (the cell's chevron was clicked). */
    autoOpenPicker?: boolean
    /**
     * The user finished the edit deliberately (Enter). NOT fired for the
     * commits that happen on blur -- focus moving to this field's own chevron
     * is one of those, and tearing the editor down there would kill the
     * popover the user just opened.
     */
    onDone?: () => void
    /** Escape: the edit is over and nothing was committed. */
    onCancel?: () => void
}

export const PaintSelCell: React.FC<PaintSelCellProps> = ({
    sceneID,
    molID,
    value,
    onCommit,
    refreshKey,
    autoFocus,
    autoOpenPicker,
    onDone,
    onCancel,
}) => {
    const [draft, setDraft] = useState(value)
    // Re-sync when the underlying entry value changes underneath us
    // (event-driven refetch).
    useEffect(() => {
        setDraft(value)
    }, [value])

    /**
     * Commit without ending the edit.
     *
     * `MolSelList` commits on blur, and blur happens when focus moves to the
     * field's own chevron -- so ending the edit here would tear the editor
     * down at the very moment the user asked for its picker, and the popover
     * would flash and vanish. Only the deliberate finishes below call
     * `onDone`; the table also closes the editor when the selected row moves.
     */
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

    /**
     * Enter confirms, Escape abandons -- the same pair the scene tree's
     * `InlineRenameInput` uses, so leaving an editor means one thing across
     * the app. Escape restores the draft first so the blur that follows has
     * nothing to commit. Editing keys are kept out of the table, which binds
     * its own meanings to them at the row level.
     */
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>): void => {
            if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                handleCommit(draft)
                onDone?.()
                return
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setDraft(value)
                onCancel?.()
                return
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.stopPropagation()
            }
        },
        [draft, value, handleCommit, onCancel, onDone],
    )

    return (
        <div className="color-paint-sel-cell">
            <MolSelList
                sceneID={sceneID}
                molID={molID}
                selectedSel={draft}
                onSelectedSelChange={setDraft}
                onCommit={handleCommit}
                onKeyDown={handleKeyDown}
                autoFocus={autoFocus}
                autoOpen={autoOpenPicker}
                refreshKey={refreshKey}
                showSelectionIcon={false}
                fill
            />
        </div>
    )
}
