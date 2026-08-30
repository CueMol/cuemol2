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
import { CueColorField } from '@renderer/h3-kit/colorpicker'
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
            onCut, onCopy, onPaste, onRemove, onRemoveAll, canPaste,
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
                onKeyDown={navKeyDown}
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
                                    <td className="color-cell-selection">
                                        <PaintSelCell
                                            sceneID={sceneId}
                                            molID={molId}
                                            value={entry.selStr}
                                            onFocus={() => onSelect(entry.idx)}
                                            onCommit={(v) =>
                                                onUpdate(entry.idx, 'selStr', v)
                                            }
                                        />
                                    </td>
                                    <td className="color-cell-color">
                                        <CueColorField
                                            value={entry.colorValue ?? ''}
                                            onCommit={(v) =>
                                                onUpdate(entry.idx, 'colorValue', v)
                                            }
                                        />
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
