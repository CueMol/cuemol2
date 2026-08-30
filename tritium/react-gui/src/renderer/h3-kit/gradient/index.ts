/**
 * @file h3-kit/gradient/index.ts
 * @description Gradient-editing catalog: the draggable stop strip and the
 * geometry it is expressed in -- value/pixel mapping, hit testing, histogram
 * binning, and the stop-list edits (move, rescale, interpolate) that a drag
 * produces.
 *
 * None of it knows about CueMol. The multi-gradient section that wires this to
 * a renderer's colouring is application code and stays outside the kit.
 *
 * @module gradient
 */

export { GradientStopBar } from './GradientStopBar';
export type { GradientCommitGesture } from './GradientStopBar';
export {
    DRAG_THRESHOLD_PX,
    DELETE_DRAG_THRESHOLD_PX,
    HIT_TOLERANCE_PX,
    MIN_STOP_SPACING,
    unionDomain,
    zoomDomain,
    niceBinWidth,
    alignedBinRange,
    histogramTargetBins,
    minHistogramBinWidth,
    histogramBarFraction,
    valueToX,
    xToValue,
    hitTestStop,
    packHex,
    interpolateHexAt,
    gradientCssStops,
    keepRatioRescale,
    moveStopFree,
} from './gradientGeometry';
export type {
    GradientHistogram,
    GradientStop,
    ValueDomain,
    BinGrid,
    HistogramFloorStats,
} from './gradientGeometry';
