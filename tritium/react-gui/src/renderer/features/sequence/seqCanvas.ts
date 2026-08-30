/**
 * @file features/sequence/seqCanvas.ts
 * @description Everything the sequence panel draws and measures, with no React
 * in it.
 *
 * The panel paints residues onto a canvas rather than laying out DOM, because
 * a long chain is tens of thousands of cells. That makes the geometry -- how
 * wide a cell is, which cell a click landed in, where the ruler ticks go --
 * ordinary arithmetic, and worth keeping where it can be read and tested
 * without mounting a panel.
 *
 * The theme is read from CSS custom properties rather than passed in: these
 * draw onto a canvas, which no stylesheet reaches.
 */

import type { SeqRow } from './useMolSequenceData';

// --- Layout / drawing constants ---
//
// Font + size pulled from --font-mono (13px) so the seq grid reads
// with the rest of the app rather than UXP's bold 14px monospace.

export const FONT_SIZE = 13
export const FONT_FAMILY = '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace'
export const FONT = `${FONT_SIZE}px ${FONT_FAMILY}`
export const ROW_MARGIN = 6
export const SEQ_HSEP = 2
export const RULER_HEIGHT = 16
// Browser canvas API caps practical bitmap width; UXP uses the same
// 30000 px guard. We apply the cap to the CSS-pixel size before HiDPI
// scaling so the backing bitmap (cssW * dpr) stays within reach.
export const MAX_CANVAS_WIDTH = 30000

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
export function setupHiDpiCanvas(
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
export function readCssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
}

export interface ThemeColors {
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

export function readThemeColors(): ThemeColors {
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


export interface CellMetrics {
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
export function measureCell(): CellMetrics {
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
export function pickCell(
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

export interface SeqRendererState {
    cellW: number
    rowH: number
    nMaxColumn: number
}

/**
 * Draw the position ruler. Ticks every 5 columns, numeric labels every
 * 5 columns starting at 5. Matches UXP `panel.renderRuler`.
 */
export function drawRuler(
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
export function drawSeq(
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
