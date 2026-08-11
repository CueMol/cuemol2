/**
 * @file __test__/gradientGeometry.test.ts
 * @description Unit tests for the pure multi-gradient geometry helpers.
 * The keep-ratio cases pin the UXP multigrad_editor.js onParChanged port.
 */

import { describe, expect, it } from 'vitest';
import {
  DELETE_DRAG_THRESHOLD_PX,
  DRAG_THRESHOLD_PX,
  MIN_STOP_SPACING,
  gradientCssStops,
  hitTestStop,
  interpolateHexAt,
  keepRatioRescale,
  alignedBinRange,
  histogramBarFraction,
  histogramTargetBins,
  minHistogramBinWidth,
  moveStopFree,
  niceBinWidth,
  packHex,
  unionDomain,
  valueToX,
  xToValue,
  zoomDomain,
} from '../components/multigrad/gradientGeometry';

describe('valueToX / xToValue', () => {
  it('maps value linearly into the lane and clamps', () => {
    expect(valueToX(0, 0, 10, 200)).toBe(0);
    expect(valueToX(5, 0, 10, 200)).toBe(100);
    expect(valueToX(10, 0, 10, 200)).toBe(200);
    expect(valueToX(-5, 0, 10, 200)).toBe(0);
    expect(valueToX(15, 0, 10, 200)).toBe(200);
  });

  it('degenerate domain maps to mid-lane', () => {
    expect(valueToX(3, 3, 3, 200)).toBe(100);
  });

  it('xToValue is the inverse within the lane and clamps x', () => {
    expect(xToValue(100, 0, 10, 200)).toBeCloseTo(5);
    expect(xToValue(-50, 0, 10, 200)).toBe(0);
    expect(xToValue(999, 0, 10, 200)).toBe(10);
    expect(xToValue(100, 3, 3, 200)).toBe(3);
  });
});

describe('hitTestStop', () => {
  const values = [0, 5, 10];
  it('returns the nearest stop within tolerance', () => {
    // stops at x = 0, 100, 200 in a 200px lane
    expect(hitTestStop(values, 98, 0, 10, 200)).toBe(1);
    expect(hitTestStop(values, 3, 0, 10, 200)).toBe(0);
  });
  it('returns -1 outside tolerance', () => {
    expect(hitTestStop(values, 50, 0, 10, 200)).toBe(-1);
  });
  it('prefers the closer stop when two are within tolerance', () => {
    // stops 0.1 apart: x = 100 and 102 in a 200px lane over [0,10]
    expect(hitTestStop([5, 5.1], 101.5, 0, 10, 200)).toBe(1);
  });
});

describe('interpolateHexAt', () => {
  const stops = [
    { value: 0, hex: '#000000' },
    { value: 10, hex: '#FF0000' },
  ];
  it('blends linearly between adjacent stops', () => {
    expect(interpolateHexAt(stops, 5)).toBe(packHex(128, 0, 0));
  });
  it('clamps outside the stop range', () => {
    expect(interpolateHexAt(stops, -1)).toBe('#000000');
    expect(interpolateHexAt(stops, 11)).toBe('#FF0000');
  });
  it('empty stop list yields black, single stop its own color', () => {
    expect(interpolateHexAt([], 0)).toBe('#000000');
    expect(interpolateHexAt([{ value: 1, hex: '#00FF00' }], 5)).toBe('#00FF00');
  });
});

describe('gradientCssStops', () => {
  it('positions stops by percentage of the domain', () => {
    const css = gradientCssStops(
      [
        { value: 0, hex: '#FF0000' },
        { value: 5, hex: '#00FF00' },
        { value: 10, hex: '#0000FF' },
      ],
      0,
      10,
    );
    expect(css).toBe(
      'linear-gradient(to right, #FF0000 0.00%, #00FF00 50.00%, #0000FF 100.00%)',
    );
  });
  it('empty stops render solid black', () => {
    expect(gradientCssStops([], 0, 1)).toContain('#000000');
  });
  it('single stop renders solid color', () => {
    const css = gradientCssStops([{ value: 3, hex: '#ABCDEF' }], 0, 10);
    expect(css).toBe('linear-gradient(to right, #ABCDEF 0%, #ABCDEF 100%)');
  });
});

describe('keepRatioRescale (UXP onParChanged port)', () => {
  it('rescales both sides of a middle stop, endpoints anchored', () => {
    // UXP formulas: left (parMin..oldVal) -> (parMin..newVal),
    //               right (oldVal..parMax) -> (newVal..parMax)
    const res = keepRatioRescale([0, 2, 4, 6, 8, 10], 2, 5);
    expect(res).not.toBeNull();
    // moved stop
    expect(res![2]).toBeCloseTo(5);
    // endpoints unchanged
    expect(res![0]).toBe(0);
    expect(res![5]).toBe(10);
    // left: 2 -> (2-0)/4*5 + 0 = 2.5
    expect(res![1]).toBeCloseTo(2.5);
    // right: 6 -> (6-4)/6*5 + 5 = 6.6667, 8 -> (8-4)/6*5 + 5 = 8.3333
    expect(res![3]).toBeCloseTo(6.666666, 4);
    expect(res![4]).toBeCloseTo(8.333333, 4);
  });

  it('vetoes each of the four 0.001-spacing conditions', () => {
    // new value too close to min
    expect(keepRatioRescale([0, 5, 10], 1, 0.0005)).toBeNull();
    // new value too close to max
    expect(keepRatioRescale([0, 5, 10], 1, 9.9995)).toBeNull();
    // old value already too close to min
    expect(keepRatioRescale([0, 0.0005, 10], 1, 5)).toBeNull();
    // old value already too close to max
    expect(keepRatioRescale([0, 9.9995, 10], 1, 5)).toBeNull();
  });

  it('moving the min endpoint rescales all middle stops', () => {
    // UXP: irow==0 -> right-side loop rescales (oldVal..parMax) -> (newVal..parMax)
    const res = keepRatioRescale([0, 5, 10], 0, 2);
    expect(res).not.toBeNull();
    expect(res![0]).toBe(2);
    // 5 -> (5-0)/10*8 + 2 = 6
    expect(res![1]).toBeCloseTo(6);
    expect(res![2]).toBe(10);
  });

  it('moving the max endpoint rescales all middle stops', () => {
    const res = keepRatioRescale([0, 5, 10], 2, 20);
    expect(res).not.toBeNull();
    expect(res![2]).toBe(20);
    // left: 5 -> (5-0)/10*20 + 0 = 10
    expect(res![1]).toBeCloseTo(10);
    expect(res![0]).toBe(0);
  });

  it('vetoes an endpoint move that collapses the span', () => {
    expect(keepRatioRescale([0, 5, 10], 0, 9.9999)).toBeNull();
    expect(keepRatioRescale([0, 5, 10], 2, 0.0005)).toBeNull();
  });

  it('single stop just moves', () => {
    expect(keepRatioRescale([3], 0, 7)).toEqual([7]);
  });
});

describe('moveStopFree', () => {
  it('re-sorts after the move and reports the new index', () => {
    const res = moveStopFree([0, 5, 10], 0, 7);
    expect(res.values).toEqual([5, 7, 10]);
    expect(res.index).toBe(1);
  });

  it('nudges away from an exact duplicate by MIN_STOP_SPACING', () => {
    const res = moveStopFree([0, 5, 10], 1, 10);
    expect(res.values).toEqual([0, 10, 10 + MIN_STOP_SPACING]);
    expect(res.index).toBe(2);
  });

  it('keeps nudging past consecutive collisions', () => {
    const res = moveStopFree([0, 0.001, 0.002, 5], 3, 0.001);
    expect(res.values).toHaveLength(4);
    const uniq = new Set(res.values);
    expect(uniq.size).toBe(4);
  });
});

describe('unionDomain / zoomDomain', () => {
    it('unionDomain merges ranges and passes through nulls', () => {
        expect(unionDomain({ min: 0, max: 5 }, { min: -2, max: 3 }))
            .toEqual({ min: -2, max: 5 });
        expect(unionDomain(null, { min: 1, max: 2 })).toEqual({ min: 1, max: 2 });
        expect(unionDomain({ min: 1, max: 2 }, null)).toEqual({ min: 1, max: 2 });
        expect(unionDomain(null, null)).toBeNull();
    });

    it('zoomDomain scales the span around the center', () => {
        // zoom out x2: [0,10] -> [-5,15]
        expect(zoomDomain({ min: 0, max: 10 }, 2)).toEqual({ min: -5, max: 15 });
        // zoom in x0.5: [0,10] -> [2.5,7.5]
        expect(zoomDomain({ min: 0, max: 10 }, 0.5)).toEqual({ min: 2.5, max: 7.5 });
        // degenerate span falls back to 1
        expect(zoomDomain({ min: 3, max: 3 }, 2)).toEqual({ min: 2, max: 4 });
    });
});

describe('histogram bin grid (nice binning)', () => {
    it('niceBinWidth rounds up onto the 1-2-5 ladder', () => {
        expect(niceBinWidth(0.078)).toBe(0.1);
        expect(niceBinWidth(0.1)).toBe(0.1);
        expect(niceBinWidth(0.11)).toBe(0.2);
        expect(niceBinWidth(0.35)).toBe(0.5);
        expect(niceBinWidth(0.7)).toBe(1);
        expect(niceBinWidth(3)).toBe(5);
        expect(niceBinWidth(42)).toBe(50);
        expect(niceBinWidth(0)).toBe(1);
        expect(niceBinWidth(Number.NaN)).toBe(1);
    });

    it('alignedBinRange snaps bounds onto bin-width multiples', () => {
        const g = alignedBinRange({ min: 0.34, max: 9.87 }, 0.5)!;
        expect(g.min).toBeCloseTo(0);
        expect(g.max).toBeCloseTo(10);
        expect(g.nbins).toBe(20);
        expect(g.binWidth).toBe(0.5);
        // exact multiples stay put (fp guard)
        const g2 = alignedBinRange({ min: 2.5, max: 12.5 }, 0.1)!;
        expect(g2.min).toBeCloseTo(2.5);
        expect(g2.max).toBeCloseTo(12.5);
        expect(g2.nbins).toBe(100);
    });

    it('pan invariance: overlapping windows share identical bin edges', () => {
        // same zoom (same bin width), two windows shifted by a non-multiple
        const a = alignedBinRange({ min: 0.13, max: 10.13 }, 0.2)!;
        const b = alignedBinRange({ min: 3.71, max: 13.71 }, 0.2)!;
        // every edge is k * 0.2, so edges in the overlap coincide exactly
        const edgeIndexA = Math.round(a.min / 0.2);
        const edgeIndexB = Math.round(b.min / 0.2);
        expect(a.min).toBeCloseTo(edgeIndexA * 0.2, 12);
        expect(b.min).toBeCloseTo(edgeIndexB * 0.2, 12);
        // windows differ only by a whole number of bins
        expect((b.min - a.min) / 0.2).toBeCloseTo(
            Math.round((b.min - a.min) / 0.2), 9);
    });

    it('alignedBinRange rejects degenerate input', () => {
        expect(alignedBinRange({ min: 1, max: 1 }, 0.1)).toBeNull();
        expect(alignedBinRange({ min: 0, max: 1 }, 0)).toBeNull();
    });

    it('histogramTargetBins sizes ~3px per bar with clamps', () => {
        expect(histogramTargetBins(0)).toBe(128);
        expect(histogramTargetBins(384)).toBe(128);
        expect(histogramTargetBins(60)).toBe(32);
        expect(histogramTargetBins(3000)).toBe(256);
    });
});

describe('minHistogramBinWidth (bin-width floor)', () => {
    // Measured from the realistic 64^3 solvent-flattened test map
    // (an OpenDX float map, so its storage is not quantized).
    const REAL = {
        sigma: 0.8564, min: -0.631, max: 8.008,
        voxelCount: 262143, peakCount: 204288, quantStep: 0,
    };

    it('floor 1: never finer than the C++ base histogram (sigma/1000)', () => {
        // a dense map where the statistical floor is negligible
        const w = minHistogramBinWidth({
            sigma: 2, min: 0, max: 10,
            voxelCount: 1e9, peakCount: 0, quantStep: 0,
        });
        expect(w).toBeCloseTo(2 / 1000, 12);
    });

    it('floor 2: keeps ~10 samples per bin, excluding the dominant peak', () => {
        const w = minHistogramBinWidth(REAL);
        const effective = REAL.voxelCount - REAL.peakCount;
        expect(w).toBeCloseTo((10 * (REAL.max - REAL.min)) / effective, 12);
        // the statistical floor dominates the base-resolution floor here
        expect(w).toBeGreaterThan(REAL.sigma / 1000);
    });

    it('the dominant peak does not inflate the sample estimate', () => {
        // Same map without excluding the peak would allow ~4.5x finer bins,
        // which is what produced the empty-bin comb.
        const withPeak = (10 * (REAL.max - REAL.min)) / REAL.voxelCount;
        expect(minHistogramBinWidth(REAL) / withPeak).toBeGreaterThan(4);
    });

    it('a sparse map gets a much coarser floor than a dense one', () => {
        const sparse = minHistogramBinWidth({
            sigma: 0.83, min: -1.13, max: 6.57,
            voxelCount: 13816, peakCount: 10712, quantStep: 0,
        });
        expect(sparse).toBeGreaterThan(minHistogramBinWidth(REAL) * 10);
    });

    it('floor 3: an 8-bit map is bounded by its value lattice', () => {
        // Same dense stats as floor 1, but stored 8-bit: the (max-min)/256
        // lattice is ~20x coarser than sigma/1000 and must win, otherwise
        // sub-lattice bins are genuinely empty (the comb-teeth artifact).
        const quantStep = 10 / 256;
        const w = minHistogramBinWidth({
            sigma: 2, min: 0, max: 10,
            voxelCount: 1e9, peakCount: 0, quantStep,
        });
        expect(w).toBeCloseTo(quantStep, 12);
    });

    it('floor 3: continuous storage (0 or null) leaves the floor alone', () => {
        const base = minHistogramBinWidth(REAL);
        expect(minHistogramBinWidth({ ...REAL, quantStep: null })).toBe(base);
        // a lattice finer than the other floors changes nothing either
        expect(minHistogramBinWidth({ ...REAL, quantStep: base / 100 })).toBe(base);
    });

    it('falls back gracefully when statistics are unavailable', () => {
        expect(minHistogramBinWidth({
            sigma: 0, min: 0, max: 0,
            voxelCount: null, peakCount: null, quantStep: null,
        })).toBe(0);
        // sigma alone still gives the base-resolution floor
        expect(minHistogramBinWidth({
            sigma: 1, min: 0, max: 10,
            voxelCount: null, peakCount: null, quantStep: null,
        })).toBeCloseTo(1e-3, 12);
        // a peak count >= the total is ignored rather than yielding 0/negative
        expect(minHistogramBinWidth({
            sigma: 1, min: 0, max: 10,
            voxelCount: 100, peakCount: 100, quantStep: null,
        })).toBeCloseTo((10 * 10) / 100, 12);
    });
});

describe('histogramBarFraction (log scale)', () => {
    it('normalizes log(1+n) against the given max', () => {
        expect(histogramBarFraction(1000, 1000)).toBe(1);
        expect(histogramBarFraction(100, 1000)).toBeCloseTo(
            Math.log1p(100) / Math.log1p(1000), 12);
    });

    it('keeps small bins visible against a huge dominant bin', () => {
        // the reported failure mode: a solvent-flattened map puts ~1e6
        // voxels in the zero bin. On a linear scale everything else is
        // sub-pixel; on the log scale it stays readable.
        const spike = 1e6;
        expect(histogramBarFraction(1000, spike)).toBeGreaterThan(0.4);
        expect(histogramBarFraction(100, spike)).toBeGreaterThan(0.3);
        expect(histogramBarFraction(10, spike)).toBeGreaterThan(0.15);
        // even a single voxel still paints something (>0.1px of 48px)
        expect(histogramBarFraction(1, spike)).toBeGreaterThan(0.04);
        // linear would have been invisible for all of them
        expect(1000 / spike).toBeLessThan(0.002);
    });

    it('is monotonic and never exceeds 1', () => {
        const y = 5000;
        let prev = -1;
        for (const n of [0.5, 1, 10, 100, 1000, 5000]) {
            const f = histogramBarFraction(n, y);
            expect(f).toBeGreaterThan(prev);
            expect(f).toBeLessThanOrEqual(1);
            prev = f;
        }
        // a bin above the nominal max clamps rather than overflowing
        expect(histogramBarFraction(1e9, y)).toBe(1);
    });

    it('handles fractional counts from rebinning', () => {
        // C++ rebinning distributes base bins fractionally
        expect(histogramBarFraction(0.5, 100)).toBeCloseTo(
            Math.log1p(0.5) / Math.log1p(100), 12);
    });

    it('degenerate inputs yield no bar', () => {
        expect(histogramBarFraction(0, 100)).toBe(0);
        expect(histogramBarFraction(-1, 100)).toBe(0);
        expect(histogramBarFraction(10, 0)).toBe(0);
        expect(histogramBarFraction(10, -5)).toBe(0);
    });
});

describe('constants', () => {
  it('pins the drag thresholds', () => {
    expect(DRAG_THRESHOLD_PX).toBe(3);
    expect(DELETE_DRAG_THRESHOLD_PX).toBe(40);
    expect(MIN_STOP_SPACING).toBe(0.001);
  });
});
