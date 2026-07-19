/**
 * Unit tests for the trajectory track geometry helpers (pure, no React).
 * These pin the frame<->pixel mapping and block color/label derivation the
 * segmented track relies on.
 */

import { describe, it, expect } from 'vitest'
import {
    frameToPx,
    pxToFrame,
    clampPxPerFrame,
    trackWidthPx,
    fitPxPerFrame,
    blockColorIndex,
    basename,
    BLOCK_COLOR_COUNT,
    MIN_PX_PER_FRAME,
    MAX_PX_PER_FRAME,
} from '../components/panels/mdtraj/trackGeometry'

describe('trackGeometry', () => {
    it('frameToPx / pxToFrame round-trip to the nearest frame', () => {
        expect(frameToPx(10, 2)).toBe(20)
        expect(pxToFrame(20, 2, 100)).toBe(10)
        // Rounds to the nearest frame.
        expect(pxToFrame(21, 2, 100)).toBe(11) // 21/2 = 10.5 -> 11
        expect(pxToFrame(20.9, 2, 100)).toBe(10) // 10.45 -> 10
    })

    it('pxToFrame clamps to [0, nframe-1]', () => {
        expect(pxToFrame(-50, 2, 100)).toBe(0)
        expect(pxToFrame(100000, 2, 100)).toBe(99)
        expect(pxToFrame(50, 2, 0)).toBe(0) // no frames
    })

    it('clampPxPerFrame keeps the scale in range', () => {
        expect(clampPxPerFrame(1000)).toBe(MAX_PX_PER_FRAME)
        expect(clampPxPerFrame(0)).toBe(MIN_PX_PER_FRAME)
        expect(clampPxPerFrame(Number.NaN)).toBeGreaterThan(0)
    })

    it('trackWidthPx honors the minimum and grows with frames', () => {
        expect(trackWidthPx(1, 2)).toBe(320) // min floor
        expect(trackWidthPx(1000, 2)).toBe(2040) // ceil(2000)+40
    })

    it('fitPxPerFrame fits frames into the available width', () => {
        // (440 - 40) / 100 = 4 px/frame
        expect(fitPxPerFrame(100, 440)).toBe(4)
        expect(fitPxPerFrame(0, 440)).toBeGreaterThan(0) // no frames -> default
    })

    it('blockColorIndex cycles within the palette', () => {
        expect(blockColorIndex(0)).toBe(0)
        expect(blockColorIndex(BLOCK_COLOR_COUNT)).toBe(0)
        expect(blockColorIndex(BLOCK_COLOR_COUNT + 2)).toBe(2)
    })

    it('basename extracts the final path segment', () => {
        expect(basename('/a/b/c.xtc')).toBe('c.xtc')
        expect(basename('C:\\d\\e.dcd')).toBe('e.dcd')
        expect(basename('plain.trr')).toBe('plain.trr')
    })
})
