/**
 * @file SequencePanel.tsx
 * @description Bottom-panel Sequence tab, mirrors UXP
 * `bottom-panels/seqpanel.{xul,js}` (`panel.btmpanel-holder.seq`).
 *
 * Every MolCoord in the active scene contributes one row per chain --
 * UXP shows them all at once, with no per-mol selector. The chain-name
 * column on the left labels each row "<chain>:<molname>".
 *
 * Layout: a Canvas-rendered chain x residue grid (one cell per residue,
 * cyan background when `residue.sel === true`), a per-residue marker (red
 * stroked rect) at the last clicked position, a sticky position ruler
 * (UXP `ruler_canvas`) above the grid, and a left-side chain-name column
 * synced to the vertical scroll.
 *
 * Selection input mirrors UXP `seqpanel.js`:
 *   - plain click toggles one residue via the `toggleResidueSelection`
 *     worker (ResidRangeSet-based; UXP `panel.toggleResidSel`)
 *   - dragging from residue A to B calls `rangeSelectResidues` with
 *     `toggle=true`, and shift+click on a previously marked position
 *     extends with `toggle=false`; both draw a green tracking rect and
 *     use `setPointerCapture` (the UXP `setCapture` equivalent)
 *   - the context menu wires every UXP `seq_ctxtmenu` item: Center here,
 *     Toggle sel, Around 3/5/7/10 and Around Byresid 3/5/7/10, Unselect
 *     all, Invert sel, and Copy sequence.
 *
 * Selection state is kept in sync through SEM_PROPCHG `sel` events, which
 * refetch only the affected molecule's rows via `getSeqPanelData`'s
 * `molIds` filter.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Menu,
    MenuDivider,
    MenuItem,
    showContextMenu,
} from '@blueprintjs/core'
import { Allotment } from 'allotment'
import { AppIcon } from '../AppIcon'
import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { SelectMolKind } from '@shared/ipcTypes'
import { useMolSequenceData, type SeqRow } from '../../hooks/useMolSequenceData'
import { useTheme } from '../../contexts/ThemeContext'

// --- Layout / drawing constants ---
//
// Font + size pulled from --font-mono (13px) so the seq grid reads
// with the rest of the app rather than UXP's bold 14px monospace.

const FONT_SIZE = 13
const FONT_FAMILY = '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace'
const FONT = `${FONT_SIZE}px ${FONT_FAMILY}`
const ROW_MARGIN = 6
const SEQ_HSEP = 2
const RULER_HEIGHT = 16
// Browser canvas API caps practical bitmap width; UXP uses the same
// 30000 px guard. We apply the cap to the CSS-pixel size before HiDPI
// scaling so the backing bitmap (cssW * dpr) stays within reach.
const MAX_CANVAS_WIDTH = 30000

/**
 * Resize a canvas so its backing bitmap matches device pixels (no blur
 * on HiDPI displays) while CSS layout uses logical pixels. Returns the
 * 2D context with a (dpr, dpr) scale already applied so subsequent
 * drawing coordinates stay in CSS pixels.
 *
 * Skips bitmap reallocation when the requested size matches what the
 * canvas already holds -- assigning to `canvas.width` reallocates the
 * backing buffer (tens of MB on HiDPI for long sequences) so guarding
 * this is the single biggest redraw saving.
 */
function setupHiDpiCanvas(
    canvas: HTMLCanvasElement,
    cssWidth: number,
    cssHeight: number,
): CanvasRenderingContext2D | null {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    const wantW = Math.floor(cssWidth * dpr)
    const wantH = Math.floor(cssHeight * dpr)
    if (canvas.width !== wantW) canvas.width = wantW
    if (canvas.height !== wantH) canvas.height = wantH
    // CSS pixel sizing is cheap to assign every time (browsers no-op
    // when the style string is unchanged).
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // setTransform replaces any existing transform. Always reset --
    // assigning canvas.width clears it, but if we skipped that branch
    // the previous transform may have changed in the meantime.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
}

/**
 * Resolve a CSS custom property declared on :root (handles both dark
 * and light themes since they only differ in custom-property values).
 * Returns the supplied fallback when running outside the DOM (e.g.
 * jsdom tests, before mount).
 */
function readCssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
}

interface ThemeColors {
    /** Glyph fill color. */
    text: string
    /** Alternate-row background tint. */
    rowAlt: string
    /** Selection highlight under residue glyphs. */
    selection: string
    /** Click marker stroke. */
    marker: string
    /** Drag tracking rect stroke. */
    track: string
    /** Ruler tick + label color. */
    ruler: string
}

function readThemeColors(): ThemeColors {
    return {
        text: readCssVar('--text-primary', '#c9cdd6'),
        rowAlt: readCssVar('--overlay-hover', 'rgba(255,255,255,0.08)'),
        // Selection highlight: keep recognisable cyan for parity, but
        // route through accent so it picks up the theme's accent hue.
        selection: readCssVar('--accent-glow', 'rgba(95,175,215,0.5)'),
        marker: readCssVar('--accent-red', '#e06c75'),
        track: readCssVar('--accent-green', '#87c38a'),
        ruler: readCssVar('--text-muted', '#888'),
    }
}

interface SequencePanelProps {
    cm: AsyncCueMol | null
    /** Active scene UID, or undefined when no scene is active. */
    activeSceneId: number | undefined
    /** Active mol-view UID -- required for Center here. */
    activeMolViewId: number | undefined
}

interface CellMetrics {
    /** Cell width (one residue), including horizontal separation. */
    cellW: number
    /** Row height. */
    rowH: number
}

/**
 * Measure 'M' once with the seq font so cell width matches UXP's
 * `mTextW`. The measurement is done on an offscreen canvas to avoid
 * mounting-order assumptions.
 */
function measureCell(): CellMetrics {
    const probe = document.createElement('canvas')
    const ctx = probe.getContext('2d')
    if (!ctx) return { cellW: 12, rowH: FONT_SIZE + ROW_MARGIN }
    ctx.font = FONT
    const m = ctx.measureText('M')
    return { cellW: m.width + SEQ_HSEP, rowH: FONT_SIZE + ROW_MARGIN }
}

/**
 * Resolve the residue cell at viewport coordinates (`clientX/Y`),
 * relative to the seq canvas. Returns `null` when outside any row or
 * past the last residue of that chain.
 */
function pickCell(
    rows: SeqRow[],
    canvas: HTMLCanvasElement,
    metrics: CellMetrics,
    clientX: number,
    clientY: number,
): { row: SeqRow; rowIndex: number; residueIndex: string } | null {
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const ix = Math.floor(x / metrics.cellW)
    const iy = Math.floor(y / metrics.rowH)
    if (iy < 0 || iy >= rows.length) return null
    const row = rows[iy]
    // UXP keys residue lookup by the numeric residue index (column
    // position). Find the residue whose parsed index matches the
    // clicked column; non-numeric (insertion-coded) residues are still
    // pickable because we compare against the leading integer.
    const match = row.residues.find((r) => parseInt(r.index, 10) === ix)
    if (!match) return null
    return { row, rowIndex: iy, residueIndex: match.index }
}

interface SeqRendererState {
    cellW: number
    rowH: number
    nMaxColumn: number
}

/**
 * Draw the position ruler. Ticks every 5 columns, numeric labels every
 * 5 columns starting at 5. Matches UXP `panel.renderRuler`.
 */
function drawRuler(
    canvas: HTMLCanvasElement,
    cellW: number,
    nMaxColumn: number,
    colors: ThemeColors,
): void {
    const cssW = Math.min(cellW * (nMaxColumn + 1), MAX_CANVAS_WIDTH)
    const ctx = setupHiDpiCanvas(canvas, cssW, RULER_HEIGHT)
    if (!ctx) return
    ctx.clearRect(0, 0, cssW, RULER_HEIGHT)
    ctx.strokeStyle = colors.ruler
    ctx.beginPath()
    for (let i = 0; i < nMaxColumn; ++i) {
        const x = (i + 0.5) * cellW
        ctx.moveTo(x, 12)
        ctx.lineTo(x, 16)
    }
    ctx.stroke()
    ctx.font = `10px ${FONT_FAMILY}`
    ctx.fillStyle = colors.ruler
    for (let i = 5; i < nMaxColumn; i += 5) {
        const label = String(i)
        const mtx = ctx.measureText(label)
        const x = (i + 0.5) * cellW - mtx.width / 2
        ctx.fillText(label, x, 10)
    }
}

/**
 * Draw the chain x residue grid. Mirrors UXP `panel.renderSeq` minus
 * the marker (rendered as a DOM overlay so click latency is not gated
 * on a full canvas redraw) and the green drag-tracking rect.
 */
function drawSeq(
    canvas: HTMLCanvasElement,
    rows: SeqRow[],
    state: SeqRendererState,
    colors: ThemeColors,
): void {
    const { cellW, rowH, nMaxColumn } = state
    const cssW = Math.min(cellW * (nMaxColumn + 1), MAX_CANVAS_WIDTH)
    const cssH = rowH * rows.length
    const ctx = setupHiDpiCanvas(canvas, cssW, cssH)
    if (!ctx) return

    ctx.clearRect(0, 0, cssW, cssH)
    ctx.font = FONT
    ctx.textBaseline = 'bottom'

    // Alternating row backgrounds (UXP "buttonface" -> theme overlay).
    for (let y = 0; y < rows.length; ++y) {
        if (y % 2 === 1) {
            ctx.fillStyle = colors.rowAlt
            ctx.fillRect(0, y * rowH, cssW, rowH)
        }
    }

    // Per-residue cells.
    for (let y = 0; y < rows.length; ++y) {
        const residues = rows[y].residues
        for (const res of residues) {
            const ires = parseInt(res.index, 10)
            if (!Number.isFinite(ires)) continue
            const xx = ires * cellW
            const yy = y * rowH
            if (res.sel) {
                ctx.fillStyle = colors.selection
                ctx.fillRect(xx, yy, cellW, rowH)
            }
            ctx.fillStyle = colors.text
            const sg = res.single === '' ? '*' : res.single
            ctx.fillText(sg, xx + SEQ_HSEP / 2, yy + (rowH + FONT_SIZE) / 2)
        }
    }
}

export const SequencePanel: React.FC<SequencePanelProps> = ({
    cm,
    activeSceneId,
    activeMolViewId,
}) => {
    const { rows } = useMolSequenceData({ cm, sceneId: activeSceneId })
    // Subscribe to theme so canvas redraws picks up the new color set.
    const { theme } = useTheme()
    const colors = useMemo<ThemeColors>(() => readThemeColors(), [theme])

    // Cell metrics are stable for a given font; compute once and reuse.
    const metrics = useMemo<CellMetrics>(() => measureCell(), [])

    // Marker (red rect) at the last click; clear when row set churns
    // (e.g. all mols removed, scene swap).
    const [marker, setMarker] = useState<{ row: number; col: number } | null>(null)
    useEffect(() => {
        if (rows.length === 0) setMarker(null)
    }, [rows])

    // Drag-tracking rect (green) shown while the user drags from one
    // residue to another. Live state -> rendered as a DOM overlay so
    // updates do not touch the seq canvas (UXP draws this on the
    // canvas; we keep the same idea but cheaper).
    const [trackRect, setTrackRect] = useState<
        { row: number; fromCol: number; toCol: number } | null
    >(null)

    // Largest residue index across all rendered rows determines canvas
    // width. Clamp to keep canvas under MAX_CANVAS_WIDTH.
    const nMaxColumn = useMemo(() => {
        let nmax = 0
        for (const row of rows) {
            for (const r of row.residues) {
                const i = parseInt(r.index, 10)
                if (Number.isFinite(i) && i > nmax) nmax = i
            }
        }
        const cap = Math.floor(MAX_CANVAS_WIDTH / metrics.cellW)
        return Math.min(nmax + 10, cap)
    }, [rows, metrics.cellW])

    // --- Refs to canvases / scroll containers ---
    const seqCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const rulerCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const scrollWrapRef = useRef<HTMLDivElement | null>(null)
    const nameListRef = useRef<HTMLDivElement | null>(null)

    // Redraw the seq canvas only when data / metrics / theme change.
    // The marker rect is a DOM overlay (see JSX below) so clicking
    // does not pay the full canvas redraw cost.
    useEffect(() => {
        const c = seqCanvasRef.current
        if (!c) return
        drawSeq(
            c,
            rows,
            { cellW: metrics.cellW, rowH: metrics.rowH, nMaxColumn },
            colors,
        )
    }, [rows, metrics, nMaxColumn, colors])

    useEffect(() => {
        const c = rulerCanvasRef.current
        if (!c) return
        drawRuler(c, metrics.cellW, nMaxColumn, colors)
    }, [metrics.cellW, nMaxColumn, colors])

    // Scroll sync: ruler tracks horizontal, name list tracks vertical
    // (UXP `panel.onSeqBoxScroll`).
    const onScroll = useCallback(() => {
        const wrap = scrollWrapRef.current
        if (!wrap) return
        if (rulerCanvasRef.current) {
            rulerCanvasRef.current.style.marginLeft = `${-wrap.scrollLeft}px`
        }
        if (nameListRef.current) {
            nameListRef.current.style.marginTop = `${-wrap.scrollTop}px`
        }
    }, [])

    // --- Click handlers ---

    const handleToggle = useCallback(
        async (row: SeqRow, residueIndex: string) => {
            if (!cm || activeSceneId === undefined) return
            await cm
                .invokeService('toggleResidueSelection', {
                    sceneId: activeSceneId,
                    molId: row.molUid,
                    chainName: row.chainName,
                    residueIndex,
                })
                .catch((err: unknown) => {
                    console.warn('toggleResidueSelection failed:', err)
                })
        },
        [cm, activeSceneId],
    )

    const handleCenter = useCallback(
        async (row: SeqRow, residueIndex: string) => {
            if (!cm || activeSceneId === undefined || activeMolViewId === undefined) return
            await cm
                .invokeService('centerOnResidue', {
                    sceneId: activeSceneId,
                    viewId: activeMolViewId,
                    molId: row.molUid,
                    chainName: row.chainName,
                    residueIndex,
                })
                .catch((err: unknown) => {
                    console.warn('centerOnResidue failed:', err)
                })
        },
        [cm, activeSceneId, activeMolViewId],
    )

    const handleRangeSelect = useCallback(
        async (
            row: SeqRow,
            fromIndex: string,
            toIndex: string,
            toggle: boolean,
        ) => {
            if (!cm || activeSceneId === undefined) return
            await cm
                .invokeService('rangeSelectResidues', {
                    sceneId: activeSceneId,
                    molId: row.molUid,
                    chainName: row.chainName,
                    fromIndex,
                    toIndex,
                    toggle,
                })
                .catch((err: unknown) => {
                    console.warn('rangeSelectResidues failed:', err)
                })
        },
        [cm, activeSceneId],
    )

    /**
     * Whole-mol selection ops dispatched from the ctx menu:
     * `Unselect all` / `Invert sel` / `Around N` / `Around Byresid N`.
     * Reuses the same `selectObjectMol` worker the scene tree's
     * Selection submenu wires (UXP `workspace_panel_molsel.js` parity).
     */
    const handleSelectMol = useCallback(
        async (row: SeqRow, kind: SelectMolKind) => {
            if (!cm || activeSceneId === undefined) return
            await cm
                .invokeService('selectObjectMol', {
                    sceneId: activeSceneId,
                    objId: row.molUid,
                    kind,
                })
                .catch((err: unknown) => {
                    console.warn(`selectObjectMol(${kind}) failed:`, err)
                })
        },
        [cm, activeSceneId],
    )

    /**
     * Copy a chain's single-letter sequence to the system clipboard.
     * Empty single-letter codes (HOH, ligands, ...) become '*' to match
     * UXP `panel.copySeq`. Renderer-side `navigator.clipboard` is the
     * Electron-friendly path (no worker / IPC needed).
     */
    const handleCopySeq = useCallback((row: SeqRow) => {
        const text = row.residues
            .map((r) => (r.single === '' ? '*' : r.single))
            .join('')
        if (typeof navigator === 'undefined' || !navigator.clipboard) return
        navigator.clipboard.writeText(text).catch((err: unknown) => {
            console.warn('clipboard.writeText failed:', err)
        })
    }, [])

    // --- Drag / pointer flow ---
    //
    // Mirrors UXP `onMouseDown` / `onMouseMoved` / `onMouseUp` (plus
    // `setCapture`) in `bottom-panels/seqpanel.js`. The full decision
    // tree fires on pointerup, not pointerdown:
    //
    //   - same residue + no shift  -> toggle + center (single click)
    //   - same residue + shift     -> rangeSelect from marker (no toggle)
    //   - different residue        -> rangeSelect from prev (toggle)
    //
    // Cross-mol / cross-chain mouseup is a no-op (UXP `mol mismatch` /
    // `chain mismatch` early returns).
    //
    // We use Pointer events with setPointerCapture so the user can drag
    // outside the canvas and still receive move/up; this is the browser
    // equivalent of UXP `aEvent.target.setCapture()`.

    interface DragState {
        prevRes: {
            rowIndex: number
            row: SeqRow
            residueIndex: string
            colIndex: number
        }
        /**
         * clientY at mousedown. We pin the pointermove y to this so a
         * vertical wobble during drag doesn't accidentally change rows
         * (UXP uses `mMouseDownY` for exactly this).
         */
        downY: number
        shiftAtDown: boolean
    }
    const dragRef = useRef<DragState | null>(null)

    const onCanvasPointerDown = useCallback(
        (event: React.PointerEvent<HTMLCanvasElement>) => {
            if (event.button !== 0) return
            const canvas = seqCanvasRef.current
            if (!canvas) return
            const hit = pickCell(rows, canvas, metrics, event.clientX, event.clientY)
            if (!hit) return
            const colIndex = parseInt(hit.residueIndex, 10)
            if (!Number.isFinite(colIndex)) return

            dragRef.current = {
                prevRes: {
                    rowIndex: hit.rowIndex,
                    row: hit.row,
                    residueIndex: hit.residueIndex,
                    colIndex,
                },
                downY: event.clientY,
                shiftAtDown: event.shiftKey,
            }

            // Plain mousedown moves the marker immediately; shift+down
            // leaves it in place so a shift+click can range from it.
            if (!event.shiftKey) {
                setMarker({ row: hit.rowIndex, col: colIndex })
            }

            // Show the (degenerate) tracking rect anchored at the
            // starting column; pointermove grows it.
            setTrackRect({ row: hit.rowIndex, fromCol: colIndex, toCol: colIndex })

            try {
                canvas.setPointerCapture(event.pointerId)
            } catch {
                // jsdom / some browsers may not implement; fall back to
                // document-level move/up only when capture fails.
            }
        },
        [rows, metrics],
    )

    const onCanvasPointerMove = useCallback(
        (event: React.PointerEvent<HTMLCanvasElement>) => {
            const drag = dragRef.current
            if (!drag) return
            const canvas = seqCanvasRef.current
            if (!canvas) return
            // Pin Y to the mousedown position (UXP `mMouseDownY`).
            const hit = pickCell(rows, canvas, metrics, event.clientX, drag.downY)
            if (!hit) return
            const colIndex = parseInt(hit.residueIndex, 10)
            if (!Number.isFinite(colIndex)) return
            setTrackRect((prev) =>
                prev && prev.toCol === colIndex ? prev : prev ? { ...prev, toCol: colIndex } : prev,
            )
        },
        [rows, metrics],
    )

    const onCanvasPointerUp = useCallback(
        (event: React.PointerEvent<HTMLCanvasElement>) => {
            const drag = dragRef.current
            dragRef.current = null
            setTrackRect(null)
            if (!drag) return

            const canvas = seqCanvasRef.current
            if (canvas) {
                try {
                    canvas.releasePointerCapture(event.pointerId)
                } catch {
                    /* ignore */
                }
            }
            if (!canvas) return

            const hit = pickCell(rows, canvas, metrics, event.clientX, drag.downY)
            if (!hit) return

            // UXP early-returns on cross-mol / cross-chain mouseup.
            if (hit.row.molUid !== drag.prevRes.row.molUid) return
            if (hit.row.chainName !== drag.prevRes.row.chainName) return

            const upCol = parseInt(hit.residueIndex, 10)
            const samePosition = hit.residueIndex === drag.prevRes.residueIndex

            if (samePosition) {
                if (drag.shiftAtDown && marker) {
                    // Shift+click on same residue -> range from marker
                    // (no toggle). UXP `mPrevRes = getResidueByPos(...)`
                    // refreshes prev to the marker before the range.
                    const markerRow = rows[marker.row]
                    if (!markerRow) return
                    if (markerRow.molUid !== hit.row.molUid) return
                    if (markerRow.chainName !== hit.row.chainName) return
                    const markerResidue = markerRow.residues.find(
                        (r) => parseInt(r.index, 10) === marker.col,
                    )
                    if (!markerResidue) return
                    if (Number.isFinite(upCol)) {
                        setMarker({ row: hit.rowIndex, col: upCol })
                    }
                    void handleRangeSelect(hit.row, markerResidue.index, hit.residueIndex, false)
                } else {
                    // Plain click: toggle + center.
                    if (Number.isFinite(upCol)) {
                        setMarker({ row: hit.rowIndex, col: upCol })
                    }
                    void handleToggle(hit.row, hit.residueIndex)
                    void handleCenter(hit.row, hit.residueIndex)
                }
                return
            }

            // Drag finished on a different residue -> range select with toggle.
            if (Number.isFinite(upCol)) {
                setMarker({ row: hit.rowIndex, col: upCol })
            }
            void handleRangeSelect(
                hit.row,
                drag.prevRes.residueIndex,
                hit.residueIndex,
                true,
            )
        },
        [rows, metrics, marker, handleToggle, handleCenter, handleRangeSelect],
    )

    const onCanvasPointerCancel = useCallback(() => {
        dragRef.current = null
        setTrackRect(null)
    }, [])

    // Context menu: every UXP `seq_ctxtmenu` item is wired. The residue
    // label header mirrors UXP `seq-ctm-reslabel`.
    const onCanvasContextMenu = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            event.preventDefault()
            const canvas = seqCanvasRef.current
            if (!canvas) return
            const hit = pickCell(rows, canvas, metrics, event.clientX, event.clientY)
            if (!hit) return

            const ix = parseInt(hit.residueIndex, 10)
            if (Number.isFinite(ix)) setMarker({ row: hit.rowIndex, col: ix })

            const residue = hit.row.residues.find((r) => r.index === hit.residueIndex)
            const label = residue
                ? `${hit.row.molName} ${hit.row.chainName}${hit.residueIndex} ${residue.name}`
                : `${hit.row.molName} ${hit.row.chainName}${hit.residueIndex}`

            const distances: ReadonlyArray<3 | 5 | 7 | 10> = [3, 5, 7, 10]
            const aroundByresItems = distances.map((d) => (
                <MenuItem
                    key={d}
                    text={`${d} A`}
                    onClick={() =>
                        void handleSelectMol(hit.row, `aroundByres${d}` as SelectMolKind)
                    }
                />
            ))
            const aroundItems = distances.map((d) => (
                <MenuItem
                    key={d}
                    text={`${d} A`}
                    onClick={() =>
                        void handleSelectMol(hit.row, `around${d}` as SelectMolKind)
                    }
                />
            ))

            const menu = (
                <Menu>
                    <MenuItem text={label} disabled />
                    <MenuDivider />
                    <MenuItem
                        text="Center here"
                        onClick={() => void handleCenter(hit.row, hit.residueIndex)}
                    />
                    <MenuItem
                        text="Toggle sel"
                        onClick={() => void handleToggle(hit.row, hit.residueIndex)}
                    />
                    <MenuItem text="Around Byresid">{aroundByresItems}</MenuItem>
                    <MenuItem text="Around">{aroundItems}</MenuItem>
                    <MenuDivider />
                    <MenuItem
                        text="Unselect all"
                        onClick={() => void handleSelectMol(hit.row, 'unselect')}
                    />
                    <MenuItem
                        text="Invert sel"
                        onClick={() => void handleSelectMol(hit.row, 'invert')}
                    />
                    <MenuDivider />
                    <MenuItem
                        text="Copy sequence"
                        onClick={() => handleCopySeq(hit.row)}
                    />
                </Menu>
            )

            showContextMenu({
                content: menu,
                targetOffset: { left: event.clientX, top: event.clientY },
            })
        },
        [rows, metrics, handleCenter, handleToggle, handleSelectMol, handleCopySeq],
    )

    // --- Render ---

    if (rows.length === 0) {
        return (
            <div className="sequence-panel">
                <div className="sequence-placeholder">
                    <AppIcon name="ui.widget" size={48} aria-hidden />
                    <div>No molecule loaded</div>
                </div>
            </div>
        )
    }

    const rowH = metrics.rowH

    return (
        <div className="sequence-panel">
            <div className="seq-panel-body">
                {/* Resizable split between chain-name column and grid.
                    Mirrors UXP `<splitter class="seqpanel-splitter"/>`. */}
                <Allotment defaultSizes={[140, 600]} proportionalLayout={false}>
                    <Allotment.Pane minSize={40} preferredSize={140}>
                        <div className="seq-name-column">
                            <div className="seq-name-spacer" style={{ height: RULER_HEIGHT }} />
                            <div className="seq-name-list" ref={nameListRef}>
                                {rows.map((row, idx) => (
                                    <div
                                        key={`${row.molUid}:${row.chainName}`}
                                        className={`seq-name-item${idx % 2 === 1 ? ' seq-name-odd' : ''}`}
                                        style={{ height: rowH }}
                                        title={`${row.chainName}:${row.molName}`}
                                    >
                                        {row.chainName}:{row.molName}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Allotment.Pane>
                    <Allotment.Pane minSize={100}>
                        <div className="seq-grid-area">
                            <div className="seq-ruler-wrap" style={{ height: RULER_HEIGHT }}>
                                <canvas
                                    ref={rulerCanvasRef}
                                    className="seq-ruler-canvas"
                                    height={RULER_HEIGHT}
                                />
                            </div>
                            <div
                                className="seq-scroll-wrap"
                                ref={scrollWrapRef}
                                onScroll={onScroll}
                            >
                                {/* Position-anchor for the marker overlay
                                    so it scrolls with the canvas content. */}
                                <div className="seq-canvas-stack">
                                    <canvas
                                        ref={seqCanvasRef}
                                        className="seq-canvas"
                                        onPointerDown={onCanvasPointerDown}
                                        onPointerMove={onCanvasPointerMove}
                                        onPointerUp={onCanvasPointerUp}
                                        onPointerCancel={onCanvasPointerCancel}
                                        onContextMenu={onCanvasContextMenu}
                                    />
                                    {trackRect && (
                                        <div
                                            className="seq-track-rect"
                                            style={{
                                                left:
                                                    Math.min(trackRect.fromCol, trackRect.toCol) *
                                                    metrics.cellW,
                                                top: trackRect.row * metrics.rowH,
                                                width:
                                                    (Math.abs(trackRect.toCol - trackRect.fromCol) + 1) *
                                                    metrics.cellW,
                                                height: metrics.rowH,
                                                borderColor: colors.track,
                                            }}
                                        />
                                    )}
                                    {marker && (
                                        <div
                                            className="seq-marker"
                                            style={{
                                                left: marker.col * metrics.cellW,
                                                top: marker.row * metrics.rowH,
                                                width: metrics.cellW,
                                                height: metrics.rowH,
                                                borderColor: colors.marker,
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </Allotment.Pane>
                </Allotment>
            </div>
        </div>
    )
}
