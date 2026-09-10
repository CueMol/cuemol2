/**
 * @file features/coloring/colorPane/PaintTable.tsx
 * @description The Paint deck's editable table: one row per paint entry, with
 * a selection expression and a colour.
 *
 * It owns the row interactions -- click / shift-range / additive select,
 * context menu, keyboard navigation, column resize -- and reports them
 * upward; the entries themselves and every mutation belong to the pane.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, Tooltip } from '@blueprintjs/core'
import { AppIcon } from '@renderer/h3-kit/primitives'
import { useShowContextMenu } from '@renderer/shell/menu/ContextMenuProvider'
import type { MenuNode } from '@shared/menuNodes'
import { ColorSwatch, CueColorField } from '@renderer/h3-kit/colorpicker'
import { scrollRowIntoView, useListKeyNav } from '@renderer/h3-kit/list'
import { useColumnResize } from '@renderer/hooks/useColumnResize'
import type { PaintEntryDto } from '@renderer/worker/server/services/coloring/coloring.service'
import { PaintSelCell } from '@renderer/features/coloring/PaintSelCell'
import {
    PAINT_COL_MIN,
    PAINT_COL_WIDTHS,
    PAINT_COL_WIDTHS_KEY,
    PAINT_MIN_COLOR_COL,
    type PaintCtxAction,
} from './coloringModes'

void React // classic JSX runtime (vitest)

/** Which of a row's two cells an editor is open on. */
type EditCol = 'sel' | 'color'

interface PaintTableProps {
    entries: PaintEntryDto[]
    /** Anchor row: drives Add's insert point and Move up/down. */
    selectedIdx: number | null
    /** Whole selection; the multi-target actions read this. */
    selectedIdxs: Set<number>
    onSelect: (idx: number) => void
    /** Cmd/Ctrl+click toggle. */
    onToggleSelect: (idx: number) => void
    /** Shift+click range from the anchor; `additive` unions instead of replacing. */
    onSelectRange: (idx: number, additive: boolean) => void
    onAdd: () => void
    onRemove: () => void
    onMoveUp: () => void
    onMoveDown: () => void
    onUpdate: (idx: number, field: 'selStr' | 'colorValue', value: string) => void
    /** Clear the whole list (UXP `paintpanel-delallbtn`). */
    onRemoveAll: () => void
    onCut: () => void
    onCopy: () => void
    onPaste: () => void
    /** True while the worker-local paint clipboard holds at least one row. */
    canPaste: boolean
    /** sceneId required for MolSelList named-def lookup. */
    sceneId: number
    /**
     * Parent mol uid (for renderer-row targets, the renderer's parent
     * object; for object-row targets, the object itself). Forwarded to
     * MolSelList so the picker shows the molecule's "current (<sel>)"
     * preset and any mol-scope named defs.
     */
    molId?: number
}

export const PaintTable: React.FC<PaintTableProps> = ({
    entries,
    selectedIdx,
    selectedIdxs,
    onSelect,
    onToggleSelect,
    onSelectRange,
    onAdd,
    onRemove,
    onMoveUp,
    onMoveDown,
    onUpdate,
    onRemoveAll,
    onCut,
    onCopy,
    onPaste,
    canPaste,
    sceneId,
    molId,
}) => {
    /** Row ids in display order, for the shared keyboard navigation. */
    const rowIds = useMemo(() => entries.map((e) => String(e.idx)), [entries])

    const isRowSelected = selectedIdxs.size > 0
    const isSingleRow = selectedIdxs.size === 1
    const showContextMenu = useShowContextMenu()

    // Drag-resizable split between the Selection and Color columns, the
    // tritium home of UXP's `<splitter class="tree-splitter"/>` between the
    // `paint_name` and `paint_value` treecols. Only the first column is
    // sized; Color absorbs the remainder, as in GenericTab.
    const { widths, startResize } = useColumnResize(
        PAINT_COL_WIDTHS,
        undefined,
        PAINT_COL_WIDTHS_KEY,
    )

    // Measure the table wrapper so the stored Selection width can be clamped
    // against the space actually available. The stored value is left alone:
    // widening the panel again restores the width the user chose.
    const wrapRef = useRef<HTMLDivElement | null>(null)
    const [wrapWidth, setWrapWidth] = useState(0)
    useEffect(() => {
        const el = wrapRef.current
        if (!el || typeof ResizeObserver === 'undefined') return
        const ro = new ResizeObserver(() => setWrapWidth(el.clientWidth))
        ro.observe(el)
        setWrapWidth(el.clientWidth)
        return () => ro.disconnect()
    }, [])
    const selWidth =
        wrapWidth > 0
            ? Math.max(
                  PAINT_COL_MIN,
                  Math.min(widths.selection, wrapWidth - PAINT_MIN_COLOR_COL),
              )
            : widths.selection

    // --- Display mode vs edit mode ---
    //
    // At most one cell is an editor at a time; every other cell is text, a
    // swatch and a chevron. This is what makes a click on a row mean "select
    // this row" -- when both cells were live inputs, a click landed in one of
    // them and the deck was in text-editing mode before the user asked for it,
    // which took Cmd+C / Cmd+V / Cmd+Z with it. Editing is entered
    // deliberately (double-click, Enter, F2, the context menu) and left with
    // Enter / Escape / selecting another row. See ui-style-guide,
    // "listbox: 行の編集モード".
    //
    // `openPicker` separates the two gestures. A chevron opens the field's
    // popover -- the selection builder, the colour picker -- which the row
    // could always do and which is not text editing, so it stays one click
    // away in display mode. Double-click / Enter / F2 open the same editor
    // with the popover shut, for typing.
    const [editing, setEditing] = useState<
        { idx: number; col: EditCol; openPicker: boolean } | null
    >(null)

    // Drop the editor when the row it belongs to is gone (deleted, or the
    // whole list replaced by a target switch) so it cannot edit whatever row
    // slid into that index.
    useEffect(() => {
        setEditing((cur) =>
            cur && entries.some((e) => e.idx === cur.idx) ? cur : null,
        )
    }, [entries])

    // Moving to another row ends the edit. The editor cannot close itself on
    // blur -- focus leaves it for its own chevron and popover -- so this is
    // what "click another row and the editor goes away" is made of.
    useEffect(() => {
        setEditing((cur) => (cur && cur.idx === selectedIdx ? cur : null))
    }, [selectedIdx])

    const beginEdit = useCallback(
        (idx: number, col: EditCol, openPicker = false) => {
            onSelect(idx)
            setEditing({ idx, col, openPicker })
        },
        [onSelect],
    )

    /**
     * Leave edit mode and put focus back on the table, so the next keystroke
     * is a table keystroke: an arrow moves rows, Cmd+Z undoes the edit against
     * the scene rather than against a text field that no longer exists.
     */
    const endEdit = useCallback(() => {
        setEditing(null)
        wrapRef.current?.focus()
    }, [])

    const isEditing = (idx: number, col: EditCol): boolean =>
        editing?.idx === idx && editing.col === col

    /**
     * A modifier-click is a row-selection gesture, not a text gesture: the
     * browser's default for Shift+mousedown is to extend the DOM text
     * selection from the last caret, which painted every row between the
     * anchor and the click as selected text. Cancelling the default here
     * leaves the click itself (and `onRowClick` below) intact.
     */
    const onRowMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) e.preventDefault()
    }, [])

    /**
     * Row click with the standard modifiers: Cmd/Ctrl toggles, Shift ranges
     * from the anchor (Shift+Cmd unions), a plain click replaces.
     */
    const onRowClick = useCallback(
        (idx: number, e: React.MouseEvent) => {
            if (e.shiftKey) {
                onSelectRange(idx, e.metaKey || e.ctrlKey)
                return
            }
            if (e.metaKey || e.ctrlKey) {
                onToggleSelect(idx)
                return
            }
            onSelect(idx)
        },
        [onSelect, onToggleSelect, onSelectRange],
    )

    /**
     * Right-click menu: the clipboard trio plus the destructive actions,
     * matching UXP's `paintPanelCtxtMenu` -- Cut / Copy / Paste lived there,
     * never on the toolbar. The accelerators shown here are the ones the app
     * menu already owns; they reach this deck through the `paint-deck`
     * clipboard scope, so the menu is a discoverability surface for keys that
     * work with or without it.
     *
     * Right-clicking a row that is already part of a multi-selection keeps
     * that selection, so the menu acts on all of it; right-clicking elsewhere
     * selects just that row first (scene-tree parity).
     */
    const onRowContextMenu = useCallback(
        (idx: number | null, e: React.MouseEvent) => {
            e.preventDefault()
            if (idx !== null && !selectedIdxs.has(idx)) onSelect(idx)
            const rows = idx !== null || isRowSelected
            const nodes: MenuNode<PaintCtxAction>[] = [
                // The editing gestures (double-click, Enter, F2) are all
                // invisible; this is where a user finds out the row can be
                // edited at all.
                { label: 'Edit selection...', enabled: idx !== null, action: 'edit' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', enabled: rows, action: 'cut' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', enabled: rows, action: 'copy' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', enabled: canPaste, action: 'paste' },
                { type: 'separator' },
                { label: 'Delete', enabled: rows, action: 'delete' },
                { label: 'Delete all', enabled: entries.length > 0, action: 'deleteAll' },
            ]
            void showContextMenu(nodes, { x: e.clientX, y: e.clientY }).then(
                (action) => {
                    switch (action) {
                        case 'edit':
                            if (idx !== null) beginEdit(idx, 'sel')
                            break
                        case 'cut': onCut(); break
                        case 'copy': onCopy(); break
                        case 'paste': onPaste(); break
                        case 'delete': onRemove(); break
                        case 'deleteAll': onRemoveAll(); break
                        default: break
                    }
                },
            )
        },
        [
            showContextMenu, selectedIdxs, isRowSelected, onSelect, entries.length,
            onCut, onCopy, onPaste, onRemove, onRemoveAll, canPaste, beginEdit,
        ],
    )

    /**
     * Arrow / Home / End over the rows, the same binding the scene tree and
     * every other list uses (h3-kit/list). Rows carry `data-row-idx` so the
     * moved-to row can be scrolled into view.
     */
    const navKeyDown = useListKeyNav({
        items: rowIds,
        activeId: selectedIdx === null ? null : String(selectedIdx),
        onSelect: (id) => onSelect(Number(id)),
        onSelectRange: (id, _items, additive) => onSelectRange(Number(id), additive),
        onScrollTo: (id) => {
            scrollRowIntoView(wrapRef.current, `[data-row-idx="${id}"]`)
        },
    })

    /**
     * Table keys: navigation, then Enter / F2 to edit the selected row.
     *
     * An open editor owns the keyboard entirely -- everything typed into it
     * bubbles here, and Enter there means "confirm", not "open an editor".
     * The scene tree guards its F2 / Delete bindings the same way.
     */
    const onTableKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (editing !== null) return
            if (navKeyDown(e)) return
            if (e.key !== 'Enter' && e.key !== 'F2') return
            if (selectedIdx === null) return
            e.preventDefault()
            beginEdit(selectedIdx, 'sel')
        },
        [editing, navKeyDown, selectedIdx, beginEdit],
    )

    return (
        <>
            <div className="color-section-label">Paint coloring:</div>
            {/* Marks the paint deck as the target of Edit > Cut/Copy/Paste
                while the user is working here. tabIndex keeps the wrapper
                focusable so a row click parks focus inside the scope; the
                handlers are registered by useClipboardScope below. */}
            <div
                ref={wrapRef}
                className="color-table-wrap"
                tabIndex={-1}
                data-clipboard-scope="paint-deck"
                onKeyDown={onTableKeyDown}
                style={{ outline: 'none' }}
            >
                <table className="color-table">
                    <colgroup>
                        <col style={{ width: selWidth }} />
                        {/* Color takes the remaining width */}
                        <col />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="color-th-selection">
                                <span className="color-th-label">Selection</span>
                                <div
                                    className="color-resize-handle"
                                    onMouseDown={(e) => startResize('selection', e)}
                                />
                            </th>
                            <th className="color-th-color">Color</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.length === 0 ? (
                            <tr onContextMenu={(e) => onRowContextMenu(null, e)}>
                                <td colSpan={2} className="color-empty-row">
                                    (no paint entries — click + to add)
                                </td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr
                                    key={entry.idx}
                                    data-row-idx={entry.idx}
                                    className={`color-row ${selectedIdxs.has(entry.idx) ? 'selected' : ''}`}
                                    onMouseDown={onRowMouseDown}
                                    onClick={(e) => onRowClick(entry.idx, e)}
                                    onContextMenu={(e) =>
                                        onRowContextMenu(entry.idx, e)
                                    }
                                >
                                    <td
                                        className="color-cell-selection"
                                        onDoubleClick={() =>
                                            beginEdit(entry.idx, 'sel')
                                        }
                                    >
                                        {isEditing(entry.idx, 'sel') ? (
                                            <PaintSelCell
                                                sceneID={sceneId}
                                                molID={molId}
                                                value={entry.selStr}
                                                // Only the typing gestures put
                                                // a caret in the field; the
                                                // chevron just opens the
                                                // picker (as the colour cell
                                                // does).
                                                autoFocus={!editing?.openPicker}
                                                autoOpenPicker={
                                                    editing?.openPicker
                                                }
                                                onCommit={(v) =>
                                                    onUpdate(entry.idx, 'selStr', v)
                                                }
                                                onDone={endEdit}
                                                onCancel={endEdit}
                                            />
                                        ) : (
                                            <span className="color-cell-view">
                                                <span className="color-cell-text type-row">
                                                    {entry.selStr}
                                                </span>
                                                {/* The builder chevron the
                                                    field carries; opening the
                                                    picker is not editing. */}
                                                <button
                                                    type="button"
                                                    className="color-cell-caret"
                                                    aria-label="Build selection"
                                                    onClick={() =>
                                                        beginEdit(entry.idx, 'sel', true)
                                                    }
                                                >
                                                    <span className="h3-form-caret" aria-hidden />
                                                </button>
                                            </span>
                                        )}
                                    </td>
                                    <td
                                        className="color-cell-color"
                                        onDoubleClick={() =>
                                            beginEdit(entry.idx, 'color')
                                        }
                                    >
                                        {isEditing(entry.idx, 'color') ? (
                                            <CueColorField
                                                value={entry.colorValue ?? ''}
                                                autoOpen={editing?.openPicker}
                                                autoFocus={!editing?.openPicker}
                                                onCommit={(v) =>
                                                    onUpdate(entry.idx, 'colorValue', v)
                                                }
                                                onDone={endEdit}
                                            />
                                        ) : (
                                            <ColorSwatch
                                                value={entry.colorValue ?? ''}
                                                onOpenPicker={() =>
                                                    beginEdit(entry.idx, 'color', true)
                                                }
                                            />
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="color-actions" data-clipboard-scope="paint-deck">
                <ButtonGroup minimal>
                    <Tooltip content="Add row" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.add" aria-hidden />}
                            aria-label="Add row"
                            className="color-action-btn"
                            onClick={onAdd}
                        />
                    </Tooltip>
                    <Tooltip content="Remove row" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.remove" aria-hidden />}
                            aria-label="Remove row"
                            className="color-action-btn"
                            onClick={onRemove}
                            disabled={!isRowSelected}
                        />
                    </Tooltip>
                    <Tooltip content="Move up" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.arrowUp" aria-hidden />}
                            aria-label="Move row up"
                            className="color-action-btn"
                            onClick={onMoveUp}
                            disabled={!isSingleRow || selectedIdx === 0}
                        />
                    </Tooltip>
                    <Tooltip content="Move down" placement="top" compact>
                        <Button
                            small
                            icon={<AppIcon name="ui.arrowDown" aria-hidden />}
                            aria-label="Move row down"
                            className="color-action-btn"
                            onClick={onMoveDown}
                            disabled={
                                !isSingleRow ||
                                (selectedIdx !== null && selectedIdx >= entries.length - 1)
                            }
                        />
                    </Tooltip>
                </ButtonGroup>
            </div>
        </>
    )
}
