/**
 * @file components/multigrad/GradientStopBar.tsx
 * @description Illustrator-style gradient stop bar: an optional histogram
 * strip, a gradient preview bar, a draggable stop-marker lane, and a
 * min/max label row.
 *
 * Controlled + CueMol-independent: the parent owns the stop list and all
 * writes. Interactions call back with a full replacement stop array:
 *   - drag a marker horizontally -> onDragStart / onPreview per frame /
 *     onCommit(stops, 'move') on release (keepRatio applies the UXP
 *     rescale; a vetoed frame keeps the previous preview),
 *   - drag a marker DELETE_DRAG_THRESHOLD_PX below the lane -> ghost
 *     preview, release deletes (onCommit(stops, 'delete')),
 *   - click empty lane space -> insert a stop with the interpolated color
 *     (onCommit(stops, 'add')),
 *   - Esc during a drag -> onAbort.
 *
 * Stops passed in may carry extra fields beyond { value, hex } (e.g. a
 * richer color string); edits spread the original objects so those fields
 * ride through onPreview / onCommit untouched. Only newly added stops are
 * bare { value, hex }.
 *
 * When `onDomainChange` is given, the histogram strip supports view-range
 * gestures: trackpad pinch (a ctrlKey wheel in Chromium) zooms anchored
 * at the cursor, dragging pans with a grab cursor, and a horizontal
 * two-finger scroll (wheel deltaX) pans. The histogram bins carry the
 * domain they were fetched for, so during a gesture the existing bars are
 * remapped onto the new view domain until the debounced refetch lands.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    DELETE_DRAG_THRESHOLD_PX,
    DRAG_THRESHOLD_PX,
    type GradientStop,
    type ValueDomain,
    gradientCssStops,
    histogramBarFraction,
    hitTestStop,
    interpolateHexAt,
    keepRatioRescale,
    moveStopFree,
    valueToX,
    xToValue,
} from './gradientGeometry'

/** Histogram data for the strip: raw bin counts + normalization max. */
export interface GradientHistogram {
    bins: number[]
    /** Max bin count within the fetched range. */
    nmax: number
    /**
     * Max bin count over the map's full range on the same grid; when
     * present it fixes the y-scale so panning does not rescale the bars.
     */
    globalNmax: number | null
    /** Value range the bins were fetched over (for view remapping). */
    domain: ValueDomain
}

/** Gesture kind reported by onCommit. */
export type GradientCommitGesture = 'move' | 'add' | 'delete'

interface GradientStopBarProps {
    /** Stop list sorted ascending by value. Extra fields are preserved. */
    stops: readonly GradientStop[]
    /**
     * Display value range for the whole bar (histogram / gradient /
     * markers / labels). Owned by the parent so it can extend beyond the
     * stop range (zoom) and stay frozen during a drag. Stops outside the
     * domain pin at the lane edges.
     */
    domain: ValueDomain
    /** Selected stop index, or null. */
    selectedIndex: number | null
    /** Histogram strip data; null hides the strip (UXP collapse parity). */
    histogram: GradientHistogram | null
    /** Apply the UXP keep-ratio rescale while dragging. */
    keepRatio: boolean
    disabled?: boolean
    onSelect: (index: number | null) => void
    /** A horizontal/vertical drag crossed the threshold (snapshot point). */
    onDragStart: () => void
    /** Per-frame preview during a drag. */
    onPreview: (stops: GradientStop[]) => void
    /** Final stop set on release / click-add. */
    onCommit: (stops: GradientStop[], gesture: GradientCommitGesture) => void
    /** Esc pressed during a drag. */
    onAbort: () => void
    /**
     * Enables histogram view-range gestures (pinch zoom / drag pan /
     * horizontal-wheel pan). Called with the full replacement domain.
     */
    onDomainChange?: (domain: ValueDomain) => void
    /**
     * Reports the bar's CSS pixel width (on mount and resize) so the
     * parent can size the histogram bin count to the strip.
     */
    onWidthChange?: (widthPx: number) => void
}

const HISTO_HEIGHT_PX = 48

/** exp() scale per wheel deltaY unit for the pinch zoom. */
const PINCH_ZOOM_K = 0.01

/**
 * Size a canvas's backing store for the devicePixelRatio (local copy of the
 * SequencePanel helper; see that file for the reallocation-guard rationale).
 */
function setupHiDpiCanvas(
    canvas: HTMLCanvasElement,
    cssWidth: number,
    cssHeight: number,
): CanvasRenderingContext2D | null {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
    const wantW = Math.max(1, Math.floor(cssWidth * dpr))
    const wantH = Math.max(1, Math.floor(cssHeight * dpr))
    if (canvas.width !== wantW) canvas.width = wantW
    if (canvas.height !== wantH) canvas.height = wantH
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
}

/** Resolve a :root CSS custom property with a non-DOM fallback. */
function readCssVar(name: string, fallback: string): string {
    if (typeof document === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
    return v || fallback
}

/** Live drag bookkeeping (kept in a ref; renders go through props). */
interface DragState {
    index: number
    startX: number
    startY: number
    /** Domain is frozen at drag start so the lane does not re-scale mid-drag. */
    min: number
    max: number
    started: boolean
    deleteArmed: boolean
    /** Last previewed stop set (the commit payload on release). */
    lastStops: GradientStop[]
    /** Original stop set at drag start (for vetoed keep-ratio frames). */
    origStops: GradientStop[]
}

/**
 * The gradient stop bar widget. See the file header for the interaction
 * contract.
 */
export const GradientStopBar: React.FC<GradientStopBarProps> = ({
    stops,
    domain,
    selectedIndex,
    histogram,
    keepRatio,
    disabled,
    onSelect,
    onDragStart,
    onPreview,
    onCommit,
    onAbort,
    onDomainChange,
    onWidthChange,
}) => {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const laneRef = useRef<HTMLDivElement | null>(null)
    const histoBoxRef = useRef<HTMLDivElement | null>(null)
    const histoRef = useRef<HTMLCanvasElement | null>(null)
    const dragRef = useRef<DragState | null>(null)
    const [histoWidth, setHistoWidth] = useState(0)
    /** Marker index currently ghosted by a delete-armed drag. */
    const [ghostIndex, setGhostIndex] = useState<number | null>(null)
    /** True while a histogram pan drag is active (grabbing cursor). */
    const [panning, setPanning] = useState(false)

    // Latest domain / gesture callback for the natively-attached wheel
    // handler (kept in refs so the listener attaches once per strip).
    const domainRef = useRef(domain)
    domainRef.current = domain
    const onDomainChangeRef = useRef(onDomainChange)
    onDomainChangeRef.current = onDomainChange
    const onWidthChangeRef = useRef(onWidthChange)
    onWidthChangeRef.current = onWidthChange

    // Report the bar width so the parent can size the bin count. The root
    // is always mounted (unlike the histogram strip), so the first report
    // arrives before the first histogram fetch settles.
    useEffect(() => {
        const el = rootRef.current
        if (!el || !onWidthChangeRef.current) return
        const report = () => onWidthChangeRef.current?.(el.clientWidth)
        const ro = new ResizeObserver(report)
        ro.observe(el)
        report()
        return () => ro.disconnect()
    }, [])

    // --- histogram strip ---

    useEffect(() => {
        const canvas = histoRef.current
        if (!canvas || histogram === null) return
        const parent = canvas.parentElement
        if (!parent) return
        const ro = new ResizeObserver(() => {
            setHistoWidth(parent.clientWidth)
        })
        ro.observe(parent)
        setHistoWidth(parent.clientWidth)
        return () => ro.disconnect()
    }, [histogram === null])

    useEffect(() => {
        const canvas = histoRef.current
        if (!canvas || histogram === null || histoWidth <= 0) return
        const ctx = setupHiDpiCanvas(canvas, histoWidth, HISTO_HEIGHT_PX)
        if (!ctx) return
        ctx.clearRect(0, 0, histoWidth, HISTO_HEIGHT_PX)
        const { bins, nmax, globalNmax, domain: fetched } = histogram
        // Fixed LOG y-scale: bar heights are log(1+n) normalized against
        // the map-wide max on the same grid, so a dominant bin (e.g. the
        // zero peak of a solvent-flattened map) cannot flatten the rest
        // and panning does not rescale the bars. Falls back to the window
        // max when the map-wide max is unavailable.
        const yMax = globalNmax !== null && globalNmax > 0 ? globalNmax : nmax
        if (bins.length === 0 || yMax <= 0) return
        const fspan = fetched.max - fetched.min
        const vspan = domain.max - domain.min
        if (!(fspan > 0) || !(vspan > 0)) return
        ctx.fillStyle = readCssVar('--text-muted', '#565e6c')
        // Bars are mapped from the domain they were FETCHED for onto the
        // CURRENT view domain, so pan/zoom gestures move the existing bars
        // immediately; the debounced refetch then replaces the data.
        const binw = fspan / bins.length
        for (let i = 0; i < bins.length; ++i) {
            const frac = histogramBarFraction(bins[i], yMax)
            if (frac <= 0) continue
            const v0 = fetched.min + i * binw
            const x0 = ((v0 - domain.min) / vspan) * histoWidth
            const x1 = ((v0 + binw - domain.min) / vspan) * histoWidth
            if (x1 < 0 || x0 > histoWidth) continue
            const h = frac * HISTO_HEIGHT_PX
            ctx.fillRect(x0, HISTO_HEIGHT_PX - h, Math.max(1, x1 - x0), h)
        }
    }, [histogram, histoWidth, domain])

    // --- histogram view-range gestures ---

    // Pinch zoom (Chromium delivers a trackpad pinch as a ctrlKey wheel)
    // anchored at the cursor, and horizontal two-finger scroll as a pan.
    // Attached natively (passive: false) because React's synthetic wheel
    // cannot preventDefault the browser page-zoom.
    useEffect(() => {
        const el = histoBoxRef.current
        if (!el || histogram === null) return
        const onWheel = (e: WheelEvent): void => {
            const cb = onDomainChangeRef.current
            if (!cb) return
            const d = domainRef.current
            const rect = el.getBoundingClientRect()
            const span = d.max - d.min
            if (!(span > 0) || rect.width <= 0) return
            if (e.ctrlKey) {
                e.preventDefault()
                const t = Math.min(
                    1, Math.max(0, (e.clientX - rect.left) / rect.width),
                )
                const anchor = d.min + t * span
                const factor = Math.exp(e.deltaY * PINCH_ZOOM_K)
                const next = {
                    min: anchor - (anchor - d.min) * factor,
                    max: anchor + (d.max - anchor) * factor,
                }
                if (next.max - next.min > 0) cb(next)
            } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.preventDefault()
                // max from min + span: wheel pans accumulate, and shifting
                // both ends independently would drift the span.
                const min = d.min + (e.deltaX / rect.width) * span
                cb({ min, max: min + span })
            }
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [histogram === null])

    /** Hand-drag pan: the content follows the pointer (grab semantics). */
    const handleHistoMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0 || disabled) return
            if (!onDomainChangeRef.current) return
            const el = histoBoxRef.current
            if (!el) return
            e.preventDefault()
            const rect = el.getBoundingClientRect()
            const startX = e.clientX
            const start = domainRef.current
            const span = start.max - start.min
            if (!(span > 0) || rect.width <= 0) return
            setPanning(true)
            const onMove = (ev: MouseEvent): void => {
                const shift = (-(ev.clientX - startX) / rect.width) * span
                const min = start.min + shift
                onDomainChangeRef.current?.({ min, max: min + span })
            }
            const onUp = (): void => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
                setPanning(false)
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
        },
        [disabled],
    )

    // --- drag lifecycle ---

    const finishDrag = useCallback(() => {
        dragRef.current = null
        setGhostIndex(null)
    }, [])

    const handleMarkerMouseDown = useCallback(
        (index: number, e: React.MouseEvent) => {
            if (e.button !== 0 || disabled) return
            e.preventDefault()
            e.stopPropagation()
            onSelect(index)
            const lane = laneRef.current
            if (!lane) return

            const drag: DragState = {
                index,
                startX: e.clientX,
                startY: e.clientY,
                min: domain.min,
                max: domain.max,
                started: false,
                deleteArmed: false,
                lastStops: [...stops],
                origStops: [...stops],
            }
            dragRef.current = drag

            const onMove = (ev: MouseEvent) => {
                const d = dragRef.current
                if (!d) return
                const dx = ev.clientX - d.startX
                const dy = ev.clientY - d.startY
                if (
                    !d.started &&
                    Math.abs(dx) <= DRAG_THRESHOLD_PX &&
                    Math.abs(dy) <= DRAG_THRESHOLD_PX
                ) {
                    return
                }
                if (!d.started) {
                    d.started = true
                    onDragStart()
                }

                // Vertical pull below the lane arms deletion (needs >= 2
                // stops; deleting the last one via drag is not offered).
                const laneRect = lane.getBoundingClientRect()
                const deleteArmed =
                    d.origStops.length >= 2 &&
                    ev.clientY - laneRect.bottom > DELETE_DRAG_THRESHOLD_PX
                if (deleteArmed !== d.deleteArmed) {
                    d.deleteArmed = deleteArmed
                    setGhostIndex(deleteArmed ? d.index : null)
                }
                if (deleteArmed) {
                    const next = d.origStops.filter((_, i) => i !== d.index)
                    d.lastStops = next
                    onPreview(next)
                    return
                }

                // Horizontal move within the frozen domain.
                const width = laneRect.width
                const x0 = valueToX(
                    d.origStops[d.index].value, d.min, d.max, width,
                )
                const newValue = xToValue(x0 + dx, d.min, d.max, width)
                const values = d.origStops.map((s) => s.value)
                if (keepRatio) {
                    const rescaled = keepRatioRescale(values, d.index, newValue)
                    // Vetoed frame: keep the previous preview.
                    if (rescaled === null) return
                    const next = d.origStops.map((s, i) => ({
                        ...s,
                        value: rescaled[i],
                    }))
                    d.lastStops = next
                    onPreview(next)
                } else {
                    const { values: moved, index: newIdx } = moveStopFree(
                        values, d.index, newValue,
                    )
                    // Rebuild the stop list in the new order: the moved stop
                    // keeps its payload, the others shift around it.
                    const others = d.origStops.filter((_, i) => i !== d.index)
                    const next: GradientStop[] = []
                    let oi = 0
                    for (let i = 0; i < moved.length; ++i) {
                        if (i === newIdx) {
                            next.push({
                                ...d.origStops[d.index],
                                value: moved[i],
                            })
                        } else {
                            next.push({ ...others[oi], value: moved[i] })
                            oi += 1
                        }
                    }
                    d.lastStops = next
                    onPreview(next)
                }
            }

            const onUp = () => {
                cleanup()
                const d = dragRef.current
                if (!d) return
                const wasDrag = d.started
                const armed = d.deleteArmed
                const payload = d.lastStops
                finishDrag()
                if (!wasDrag) return // bare click: selection already done
                if (armed) {
                    onSelect(null)
                    onCommit(payload, 'delete')
                } else {
                    onCommit(payload, 'move')
                }
            }

            const onKeyDown = (ev: KeyboardEvent) => {
                if (ev.key !== 'Escape') return
                const d = dragRef.current
                if (!d) return
                const wasDrag = d.started
                cleanup()
                finishDrag()
                if (wasDrag) onAbort()
            }

            const cleanup = () => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
                document.removeEventListener('keydown', onKeyDown)
            }

            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
            document.addEventListener('keydown', onKeyDown)
        },
        [
            disabled, domain, stops, keepRatio,
            onSelect, onDragStart, onPreview, onCommit, onAbort, finishDrag,
        ],
    )

    /** Click on empty lane space: insert a stop at the pointer value. */
    const handleLaneMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (e.button !== 0 || disabled) return
            const lane = laneRef.current
            if (!lane) return
            const rect = lane.getBoundingClientRect()
            const x = e.clientX - rect.left
            const values = stops.map((s) => s.value)
            // Only VISIBLE markers claim the click: out-of-domain stops are
            // not rendered, so they must not swallow lane-edge clicks
            // (NaN never matches the hit test).
            const eps = (domain.max - domain.min) * 1e-9
            const visibleValues = values.map((v) =>
                v < domain.min - eps || v > domain.max + eps ? Number.NaN : v,
            )
            if (hitTestStop(visibleValues, x, domain.min, domain.max, rect.width) >= 0) {
                return // marker handles its own mousedown
            }
            const value = xToValue(x, domain.min, domain.max, rect.width)
            // an empty gradient has no color to interpolate; start white
            const hex = stops.length === 0
                ? '#FFFFFF'
                : interpolateHexAt(stops, value)
            const { values: merged, index } = moveStopFree(
                [...values, Number.NaN],
                values.length,
                value,
            )
            const others = [...stops]
            const next: GradientStop[] = []
            let oi = 0
            for (let i = 0; i < merged.length; ++i) {
                if (i === index) {
                    next.push({ value: merged[i], hex })
                } else {
                    next.push(others[oi])
                    oi += 1
                }
            }
            onSelect(index)
            onCommit(next, 'add')
        },
        [disabled, stops, domain, onSelect, onCommit],
    )

    const gradientCss = useMemo(
        () => gradientCssStops(stops, domain.min, domain.max),
        [stops, domain],
    )

    const fmt = (v: number) => v.toFixed(2)

    return (
        <div
            ref={rootRef}
            className={`mg-stopbar${disabled ? ' is-disabled' : ''}`}
        >
            {histogram !== null && (
                <div
                    ref={histoBoxRef}
                    className={
                        'mg-histo' +
                        (onDomainChange ? ' is-pannable' : '') +
                        (panning ? ' is-panning' : '')
                    }
                    onMouseDown={handleHistoMouseDown}
                >
                    <canvas ref={histoRef} className="mg-histo-canvas" />
                </div>
            )}
            <div className="mg-gradient-bar" style={{ background: gradientCss }} />
            <div
                ref={laneRef}
                className="mg-stop-lane"
                onMouseDown={handleLaneMouseDown}
            >
                {stops.map((s, i) => {
                    const span = domain.max - domain.min
                    // Out-of-domain stops are not rendered (they used to pin
                    // at the lane edges, hiding the true position AND eating
                    // lane-edge clicks). They stay editable via the selected
                    // -stop row and come back into view with Fit.
                    const eps = span * 1e-9
                    if (
                        span > 0 &&
                        (s.value < domain.min - eps || s.value > domain.max + eps)
                    ) {
                        return null
                    }
                    const pct = span <= 0
                        ? 50
                        : ((s.value - domain.min) / span) * 100
                    const cls =
                        'mg-stop-marker' +
                        (i === selectedIndex ? ' is-selected' : '') +
                        (i === ghostIndex ? ' is-ghost' : '')
                    return (
                        <div
                            key={i}
                            className={cls}
                            style={{ left: `${Math.min(100, Math.max(0, pct))}%` }}
                            data-index={i}
                            onMouseDown={(e) => handleMarkerMouseDown(i, e)}
                        >
                            <div className="mg-stop-pointer" />
                            <div
                                className="mg-stop-swatch"
                                style={{ background: s.hex }}
                            />
                        </div>
                    )
                })}
            </div>
            <div className="mg-minmax-row type-caption">
                <span>{fmt(domain.min)}</span>
                <span>{fmt(domain.max)}</span>
            </div>
        </div>
    )
}
