/**
 * @file features/coloring/section/useGradientViewDomain.ts
 * @description The value range the gradient strip is looking at, and the
 * zoom / pan that moves it.
 *
 * The view domain is deliberately independent of the stop range: a user
 * zooming in to place a stop precisely must not have the view snap back every
 * time the stops move. `fitDomain` is the baseline the Fit button returns to,
 * and it prefers the central-95% histogram range over the raw map min/max,
 * because a single outlier voxel otherwise compresses every stop into a
 * sliver at one end.
 *
 * The domain is frozen for the duration of a drag (`previewStops !== null`):
 * the stops are moving, and letting the axis move with them would make the
 * marker appear to stand still.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import {
    minHistogramBinWidth,
    zoomDomain,
    type ValueDomain,
} from '@renderer/h3-kit/gradient';
import { useMultiGradHistogram } from '@renderer/features/coloring/useMultiGradHistogram';
import type { GetMultiGradStateResult } from '@renderer/worker/server/services/rendererColoring.service';
import { PAN_STEP, type MultiGradStop } from './gradientStops';

export interface UseGradientViewDomainOptions {
    cm: AsyncCueMol | null;
    sceneId: number | undefined;
    rendId: number | null;
    state: GetMultiGradStateResult | null;
    canonicalStops: MultiGradStop[];
    /** Non-null while a drag is previewing; freezes the axis. */
    previewStops: MultiGradStop[] | null;
    /** Measured strip width, for the histogram's bin count. */
    stripWidth: number;
}

export function useGradientViewDomain({
    cm, sceneId, rendId, state, canonicalStops, previewStops, stripWidth,
}: UseGradientViewDomainOptions) {
    // User zoom / pan; null means "follow the fit domain".
    const [viewOverride, setViewOverride] = useState<ValueDomain | null>(null);

    // Fit domain (the -/+/Fit baseline): the stop range when nodes exist;
    // otherwise the central-95% histogram range (raw map min/max is
    // usually blown up by outliers), then the raw map range, then a
    // synthetic fallback.
    const fitDomain = useMemo<ValueDomain>(() => {
        if (canonicalStops.length >= 2) {
            const min = canonicalStops[0].value
            const max = canonicalStops[canonicalStops.length - 1].value
            if (max > min) return { min, max }
        }
        const p = state?.mapPercentiles
        if (p && p.hi > p.lo) return { min: p.lo, max: p.hi }
        const stats = state?.mapStats
        if (stats && stats.max > stats.min) {
            return { min: stats.min, max: stats.max }
        }
        if (canonicalStops.length === 1) {
            const v = canonicalStops[0].value
            return { min: v - 0.5, max: v + 0.5 }
        }
        return { min: 0, max: 1 }
    }, [canonicalStops, state?.mapPercentiles, state?.mapStats])

    const activeDomain = viewOverride ?? fitDomain

    // Freeze the domain while an override is live so a mid-drag canonical
    // refetch (whose values follow the drag) cannot rescale the bar.
    const frozenDomainRef = useRef(activeDomain)
    if (previewStops === null) frozenDomainRef.current = activeDomain
    const viewDomain = previewStops !== null
        ? frozenDomainRef.current
        : activeDomain

    const handleZoom = useCallback((factor: number) => {
        setViewOverride((prev) => zoomDomain(prev ?? frozenDomainRef.current, factor))
    }, [])

    const handlePan = useCallback((direction: -1 | 1) => {
        setViewOverride((prev) => {
            const base = prev ?? frozenDomainRef.current
            // Derive max from min + span (rather than shifting both ends)
            // so repeated pans cannot drift the span through floating-
            // point accumulation, which would silently change the zoom.
            const span = base.max - base.min
            const min = base.min + span * PAN_STEP * direction
            return { min, max: min + span }
        })
    }, [])

    // Floor on the bin width, from the map's own statistics: zooming in
    // past it cannot reveal more structure, so the bars widen instead of
    // splitting into empty comb teeth.
    const minBinWidth = useMemo(() => {
        const s = state?.mapStats
        if (!s) return 0
        return minHistogramBinWidth({
            sigma: s.sigma,
            min: s.min,
            max: s.max,
            voxelCount: state?.mapVoxelCount ?? null,
            peakCount: state?.mapPeakCount ?? null,
            quantStep: s.quantStep,
        })
    }, [state?.mapStats, state?.mapVoxelCount, state?.mapPeakCount])

    const histogram = useMultiGradHistogram({
        cm,
        sceneId,
        rendId,
        domain: viewDomain,
        widthPx: stripWidth,
        minBinWidth,
        paused: previewStops !== null,
        enabled: state?.capable === true,
    })

    return {
        fitDomain,
        activeDomain,
        viewDomain,
        histogram,
        handleZoom,
        handlePan,
        setViewOverride,
        /** True while the view is zoomed / panned off the fit baseline. */
        isViewOverridden: viewOverride !== null,
        /**
         * The domain as it was when the current drag began. A commit compares
         * the new stop range against it to decide whether the view has to
         * follow, so it needs the same frozen value the strip is drawing.
         */
        frozenDomainRef,
    };
}
