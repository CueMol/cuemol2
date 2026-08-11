/**
 * @file hooks/useMultiGradHistogram.ts
 * @description Histogram strip data for the Multi-gradient deck.
 *
 * Bins follow the d3/Vega convention: the bin width is snapped to the
 * 1-2-5 "nice" ladder from the view span and the strip's pixel width
 * (~3 px per bar), and the fetched range is expanded to bin-width
 * multiples (origin at 0). Two overlapping views at the same zoom level
 * therefore share identical bin edges, so a pan renders as a pure
 * translation of the same bars -- and a pan smaller than one bin does
 * not refetch at all. The worker also returns `globalNmax` (the max bin
 * over the map's full range on the same grid) so the y-scale stays fixed
 * while panning.
 *
 * Domain changes are debounced (~100 ms) so per-frame drag previews do
 * not refetch; callers additionally freeze the domain during a drag by
 * passing `paused: true`. Returns null when the map is unresolved (the
 * strip is hidden, UXP collapse parity).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import type { GradientHistogram } from '../components/multigrad/GradientStopBar'
import {
    alignedBinRange,
    histogramTargetBins,
    niceBinWidth,
} from '../components/multigrad/gradientGeometry'

const DOMAIN_DEBOUNCE_MS = 100

export interface UseMultiGradHistogramOptions {
    cm: AsyncCueMol | null
    sceneId: number | undefined
    rendId: number | null
    /** View domain; null when there is nothing to show. */
    domain: { min: number; max: number } | null
    /** Measured strip width in CSS px; 0/undefined -> default bin count. */
    widthPx?: number
    /**
     * Lower bound on the bin width in density units (see
     * `minHistogramBinWidth`). Zooming past it stops refining the bins
     * and simply widens the bars.
     */
    minBinWidth?: number
    /** True while a drag is in flight -- skips refetches. */
    paused?: boolean
    /** When false the hook idles and reports null. */
    enabled?: boolean
}

/**
 * Fetch the rebinned histogram for the deck's current view domain.
 * Returns null while unavailable (no map, no domain, or disabled).
 */
export function useMultiGradHistogram({
    cm,
    sceneId,
    rendId,
    domain,
    widthPx,
    minBinWidth = 0,
    paused = false,
    enabled = true,
}: UseMultiGradHistogramOptions): GradientHistogram | null {
    const [histogram, setHistogram] = useState<GradientHistogram | null>(null)
    const tokenRef = useRef(0)

    const min = domain?.min
    const max = domain?.max

    // Snap the request onto the nice, origin-aligned bin grid, never
    // finer than the map can support (`minBinWidth`).
    const grid = useMemo(() => {
        if (min === undefined || max === undefined || !(max > min)) return null
        const target = histogramTargetBins(widthPx ?? 0)
        const raw = Math.max((max - min) / target, minBinWidth)
        return alignedBinRange({ min, max }, niceBinWidth(raw))
    }, [min, max, widthPx, minBinWidth])

    useEffect(() => {
        if (paused) return
        if (!cm || !enabled || sceneId === undefined || rendId === null ||
            grid === null) {
            setHistogram(null)
            return
        }
        const token = ++tokenRef.current
        const timer = setTimeout(() => {
            cm.invokeService('getMultiGradHistogram', {
                sceneId, rendId,
                min: grid.min, max: grid.max, nbins: grid.nbins,
            })
                .then((res) => {
                    if (token !== tokenRef.current) return
                    setHistogram(
                        res.ok
                            ? {
                                bins: res.histo,
                                nmax: res.nmax,
                                globalNmax: res.globalNmax ?? null,
                                domain: { min: grid.min, max: grid.max },
                            }
                            : null,
                    )
                })
                .catch(() => {
                    if (token !== tokenRef.current) return
                    setHistogram(null)
                })
        }, DOMAIN_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [cm, enabled, paused, sceneId, rendId,
        grid?.min, grid?.max, grid?.nbins])

    return histogram
}
