/**
 * @file components/multigrad/gradientGeometry.ts
 * @description Pure geometry / color helpers for the multi-gradient stop bar.
 *
 * All helpers are side-effect free so they can be unit-tested without React.
 * Stop values are in map-density units; the display domain is [min, max]
 * (usually the min/max of the current stop set). Pixel math uses the lane
 * width in CSS pixels.
 */

/** Pointer must move this far (px) before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 3;

/** Dragging a stop this far below the lane deletes it on release. */
export const DELETE_DRAG_THRESHOLD_PX = 40;

/** Hit-test tolerance around a stop marker (px). */
export const HIT_TOLERANCE_PX = 6;

/**
 * Minimum spacing between two stop values. The C++ MultiGradient stores
 * nodes in a std::set keyed by value, so exact duplicates are dropped;
 * keep-ratio rescale also vetoes moves that squeeze spacing below this.
 */
export const MIN_STOP_SPACING = 0.001;

/** A gradient stop as displayed by the UI. */
export interface GradientStop {
  /** Map-density value of the stop. */
  value: number;
  /** Display color as #RRGGBB hex. */
  hex: string;
}

/** A display value range [min, max]. */
export interface ValueDomain {
  min: number;
  max: number;
}

/** Union of two (possibly null) domains; null when both are null. */
export function unionDomain(
  a: ValueDomain | null,
  b: ValueDomain | null,
): ValueDomain | null {
  if (!a) return b;
  if (!b) return a;
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

/**
 * Scale a domain's span by `factor` around its center (factor > 1 widens
 * = zoom out, factor < 1 narrows = zoom in). A degenerate span falls back
 * to 1 so zooming a single-value domain still produces a usable range.
 */
export function zoomDomain(domain: ValueDomain, factor: number): ValueDomain {
  const center = (domain.min + domain.max) / 2;
  const baseSpan = domain.max - domain.min;
  const span = (baseSpan > 0 ? baseSpan : 1) * factor;
  return { min: center - span / 2, max: center + span / 2 };
}

// --- histogram bin grid (d3/Vega-style nice binning) ---

/**
 * Round a raw bin width UP to the 1-2-5 x 10^k "nice" ladder (the d3
 * tick-step convention). Binning on a nice, data-anchored grid keeps bin
 * edges stable under panning; the width only changes at discrete zoom
 * thresholds.
 */
export function niceBinWidth(rawWidth: number): number {
  if (!(rawWidth > 0) || !Number.isFinite(rawWidth)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rawWidth)));
  const frac = rawWidth / pow;
  if (frac <= 1) return pow;
  if (frac <= 2) return 2 * pow;
  if (frac <= 5) return 5 * pow;
  return 10 * pow;
}

/** A concrete histogram bin grid: aligned range + bin count/width. */
export interface BinGrid {
  min: number;
  max: number;
  nbins: number;
  binWidth: number;
}

/** Guard against fp noise when snapping domain bounds to bin indices. */
const BIN_ALIGN_EPS = 1e-9;

/**
 * Expand a domain to the enclosing range whose bounds sit on integer
 * multiples of `binWidth` (bin origin at 0). Two overlapping views at the
 * same bin width therefore share identical bin edges, which is what makes
 * a pan render as a pure translation of the same bars.
 */
export function alignedBinRange(
  domain: ValueDomain,
  binWidth: number,
): BinGrid | null {
  if (!(binWidth > 0) || !(domain.max > domain.min)) return null;
  const i0 = Math.floor(domain.min / binWidth + BIN_ALIGN_EPS);
  const i1 = Math.ceil(domain.max / binWidth - BIN_ALIGN_EPS);
  const nbins = i1 - i0;
  if (nbins <= 0) return null;
  return { min: i0 * binWidth, max: i1 * binWidth, nbins, binWidth };
}

/**
 * Target histogram bin count for a strip of `widthPx` CSS pixels
 * (~3 px per bar). Unknown width falls back to 128.
 */
export function histogramTargetBins(widthPx: number): number {
  if (!(widthPx > 0)) return 128;
  return Math.min(256, Math.max(32, Math.round(widthPx / 3)));
}

/**
 * Bins per sigma in the C++ base histogram: `ScalarObject::calcBaseHistogram`
 * uses a bin width of `rmsd / 1000`, so `sigma / 1000` is the finest
 * resolution the cached histogram can express.
 */
const BASE_HIST_BINS_PER_SIGMA = 1000;

/** Samples a display bin should hold on average before we refuse to split further. */
const MIN_SAMPLES_PER_BIN = 10;

/** Inputs for {@link minHistogramBinWidth}; all from the map's own statistics. */
export interface HistogramFloorStats {
  /** Map RMSD (`den_sigma`). */
  sigma: number;
  /** Map density range. */
  min: number;
  max: number;
  /** Voxels counted over the full range; null when unknown. */
  voxelCount: number | null;
  /** Largest single-bin count over the full range (the dominant peak). */
  peakCount: number | null;
  /**
   * Spacing of the map's discrete value lattice (`den_quant_step`);
   * 0 or null when the storage is continuous.
   */
  quantStep: number | null;
}

/**
 * Smallest histogram bin width worth requesting for a map, in density
 * units. Zooming past this point cannot reveal more structure, so the
 * caller clamps the bin width here and the bars simply get wider -- the
 * behaviour Plotly/matplotlib have by default, expressed the way
 * Vega-Lite does it (`bin.minstep`).
 *
 * Three independent floors, whichever is coarsest:
 *  1. the C++ base histogram's own resolution (`sigma / 1000`) -- below
 *     it the rebin just smears the same numbers;
 *  2. enough samples per bin on average. The dominant bin is excluded
 *     from the count first: a solvent-flattened map puts ~80% of its
 *     voxels in the zero peak, and counting those would badly
 *     over-estimate how much data is available to fill the other bins;
 *  3. the data's own quantization step. 8-bit maps (CCP4/MRC via
 *     DensityMap) only take 256 distinct values spaced (max-min)/256
 *     apart -- far coarser than floors 1 and 2 -- and bins narrower
 *     than that lattice are genuinely empty between the lattice points,
 *     which is what draws the comb-teeth artifact.
 *
 * All terms are per-map constants, so the bin width still depends only
 * on the zoom level -- panning never changes it and stays a pure
 * translation.
 *
 * @returns the floor, or 0 when the statistics are unavailable.
 */
export function minHistogramBinWidth(stats: HistogramFloorStats): number {
  const { sigma, min, max, voxelCount, peakCount, quantStep } = stats;
  let floor = 0;
  if (sigma > 0) floor = sigma / BASE_HIST_BINS_PER_SIGMA;

  const range = max - min;
  if (range > 0 && voxelCount !== null && voxelCount > 0) {
    const effective =
      peakCount !== null && peakCount > 0 && peakCount < voxelCount
        ? voxelCount - peakCount
        : voxelCount;
    if (effective > 0) {
      floor = Math.max(floor, (MIN_SAMPLES_PER_BIN * range) / effective);
    }
  }

  if (quantStep !== null && quantStep > 0) {
    floor = Math.max(floor, quantStep);
  }
  return floor;
}

/**
 * Bar height fraction (0..1) for one histogram bin, on the logarithmic
 * scale that volume viewers use for density maps.
 *
 * Map histograms span many orders of magnitude: a solvent-flattened map
 * puts millions of voxels in a single bin, and on a linear scale every
 * real feature collapses to sub-pixel height. log(1 + n) turns that
 * ratio into a difference -- against a peak of 1e6 a bin of 1000 still
 * draws at half height and a bin of 1 stays visible. This matches
 * UCSF ChimeraX, whose volume viewer feeds `log(counts + 1)` to its
 * histogram widget and offers no vertical zoom at all.
 *
 * @param count - Raw bin count (may be fractional after rebinning).
 * @param yMax - Raw count the scale tops out at; pass the map-wide max
 *   so the scale stays fixed while the view pans.
 */
export function histogramBarFraction(count: number, yMax: number): number {
  if (!(count > 0) || !(yMax > 0)) return 0;
  const denom = Math.log1p(yMax);
  if (!(denom > 0)) return 0;
  return Math.min(1, Math.log1p(count) / denom);
}

/**
 * Map a stop value to an x pixel offset in a lane of `width` px.
 * Clamped to [0, width]. A degenerate domain (max <= min) maps to mid-lane.
 */
export function valueToX(
  value: number,
  min: number,
  max: number,
  width: number,
): number {
  if (width <= 0) return 0;
  const span = max - min;
  if (span <= 0) return width / 2;
  const x = ((value - min) / span) * width;
  return Math.min(width, Math.max(0, x));
}

/**
 * Map an x pixel offset back to a stop value. x is clamped to [0, width];
 * a degenerate lane or domain returns `min`.
 */
export function xToValue(
  x: number,
  min: number,
  max: number,
  width: number,
): number {
  if (width <= 0) return min;
  const span = max - min;
  if (span <= 0) return min;
  const cx = Math.min(width, Math.max(0, x));
  return min + (cx / width) * span;
}

/**
 * Find the stop nearest to pixel `x` within `tolerancePx`.
 *
 * @returns the stop index, or -1 when nothing is within tolerance.
 */
export function hitTestStop(
  values: readonly number[],
  x: number,
  min: number,
  max: number,
  width: number,
  tolerancePx: number = HIT_TOLERANCE_PX,
): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < values.length; ++i) {
    const sx = valueToX(values[i], min, max, width);
    const d = Math.abs(sx - x);
    if (d <= tolerancePx && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/** Parse #RGB / #RRGGBB hex to [r, g, b] (0-255). Invalid input -> black. */
function parseHex(hex: string): [number, number, number] {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0];
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Pack [r, g, b] (0-255) into #RRGGBB. */
export function packHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  const n = (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
  return `#${n.toString(16).padStart(6, '0').toUpperCase()}`;
}

/**
 * Interpolated gradient color at `value`, matching the C++
 * MultiGradient::getColor semantics: clamp to the first/last stop outside
 * the range, linear RGB blend between adjacent stops inside it.
 * An empty stop list yields black (C++ renders black too).
 *
 * @remarks `stops` must be sorted ascending by value.
 */
export function interpolateHexAt(
  stops: readonly GradientStop[],
  value: number,
): string {
  if (stops.length === 0) return '#000000';
  if (stops.length === 1 || value <= stops[0].value) return stops[0].hex;
  const last = stops[stops.length - 1];
  if (value >= last.value) return last.hex;
  for (let i = 0; i + 1 < stops.length; ++i) {
    const lo = stops[i];
    const hi = stops[i + 1];
    if (lo.value <= value && value < hi.value) {
      const t = (value - lo.value) / (hi.value - lo.value);
      const [r1, g1, b1] = parseHex(lo.hex);
      const [r2, g2, b2] = parseHex(hi.hex);
      return packHex(
        r1 + (r2 - r1) * t,
        g1 + (g2 - g1) * t,
        b1 + (b2 - b1) * t,
      );
    }
  }
  return last.hex;
}

/**
 * Build a CSS `linear-gradient(to right, ...)` string for the preview bar.
 * Stops are positioned by (value - min) / (max - min). An empty stop list
 * yields solid black (matching the C++ renderer output for no nodes).
 *
 * @remarks `stops` must be sorted ascending by value.
 */
export function gradientCssStops(
  stops: readonly GradientStop[],
  min: number,
  max: number,
): string {
  if (stops.length === 0) {
    return 'linear-gradient(to right, #000000 0%, #000000 100%)';
  }
  const span = max - min;
  const items = stops.map((s) => {
    const pct = span <= 0 ? 50 : ((s.value - min) / span) * 100;
    const cpct = Math.min(100, Math.max(0, pct));
    return `${s.hex} ${cpct.toFixed(2)}%`;
  });
  if (stops.length === 1) {
    // solid color across the bar
    return `linear-gradient(to right, ${stops[0].hex} 0%, ${stops[0].hex} 100%)`;
  }
  return `linear-gradient(to right, ${items.join(', ')})`;
}

/**
 * Keep-ratio move: faithful port of the UXP multigrad_editor.js
 * onParChanged keep-ratio branch. Moving a middle stop keeps both endpoints
 * anchored and linearly rescales the stops on each side of the moved one;
 * moving an endpoint rescales every middle stop proportionally.
 *
 * Vetoes (returns null) when the move would squeeze any of the four
 * old/new gaps below MIN_STOP_SPACING (UXP checks this only for middle
 * stops; endpoint moves additionally veto when the whole span would
 * collapse, which the modal UXP dialog could not hit but a drag UI can).
 *
 * @param values - Current stop values, sorted ascending.
 * @param movedIdx - Index of the stop being moved.
 * @param newValue - Requested new value for that stop.
 * @returns the full rescaled value array, or null when vetoed.
 */
export function keepRatioRescale(
  values: readonly number[],
  movedIdx: number,
  newValue: number,
): number[] | null {
  const n = values.length;
  if (movedIdx < 0 || movedIdx >= n) return null;
  if (n === 1) return [newValue];

  const parMin = values[0];
  const parMax = values[n - 1];
  const oldVal = values[movedIdx];

  if (movedIdx > 0 && movedIdx < n - 1) {
    // UXP veto: any of the four old/new gaps below the minimum spacing
    if (
      newValue - parMin < MIN_STOP_SPACING ||
      parMax - newValue < MIN_STOP_SPACING ||
      oldVal - parMin < MIN_STOP_SPACING ||
      parMax - oldVal < MIN_STOP_SPACING
    ) {
      return null;
    }
  } else if (movedIdx === 0) {
    // endpoint safety: keep a usable span
    if (parMax - newValue < MIN_STOP_SPACING) return null;
  } else {
    if (newValue - parMin < MIN_STOP_SPACING) return null;
  }

  const result = values.slice();

  // left side: rescale (parMin, oldVal) -> (parMin, newValue)
  const del1 = oldVal - parMin;
  const newDel1 = newValue - parMin;
  for (let i = 1; i < movedIdx; ++i) {
    result[i] = ((values[i] - parMin) / del1) * newDel1 + parMin;
  }

  result[movedIdx] = newValue;

  // right side: rescale (oldVal, parMax) -> (newValue, parMax)
  const del2 = parMax - oldVal;
  const newDel2 = parMax - newValue;
  for (let i = movedIdx + 1; i < n - 1; ++i) {
    result[i] = ((values[i] - oldVal) / del2) * newDel2 + newValue;
  }

  return result;
}

/**
 * Free move: place the moved stop at `newValue`, re-sort, and nudge away
 * from exact collisions with other stops by MIN_STOP_SPACING (the C++
 * std::set silently drops exact duplicates, so collisions must not reach
 * the write path).
 *
 * @param values - Current stop values, sorted ascending.
 * @param movedIdx - Index of the stop being moved.
 * @param newValue - Requested new value for that stop.
 * @returns the new sorted value array and the moved stop's index in it.
 */
export function moveStopFree(
  values: readonly number[],
  movedIdx: number,
  newValue: number,
): { values: number[]; index: number } {
  const others = values.filter((_, i) => i !== movedIdx);
  let cand = newValue;
  const collides = (v: number) => others.some((o) => Math.abs(o - v) < 1e-9);
  while (collides(cand)) cand += MIN_STOP_SPACING;

  const merged = [...others, cand].sort((a, b) => a - b);
  return { values: merged, index: merged.indexOf(cand) };
}
