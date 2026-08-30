/**
 * Unit tests for the PNG export size helpers (`exportPngSize`), backing the
 * UXP `exportpng-opt-dlg` resolution/unit conversions.
 */

import { describe, it, expect } from 'vitest'
import { toPixels, fromPixels, roundForUnit } from '@renderer/dialogs/exportPngSize'

describe('exportPngSize', () => {
    it('passes pixels through unchanged (DPI-independent)', () => {
        expect(toPixels(1024, 'px', 150)).toBe(1024)
        expect(fromPixels(1024, 'px', 150)).toBe(1024)
        expect(toPixels(800.4, 'px', 72)).toBe(800)
    })

    it('converts inches to pixels at the given DPI', () => {
        expect(toPixels(2, 'in', 300)).toBe(600)
        expect(toPixels(1, 'in', 72)).toBe(72)
    })

    it('converts mm and cm to pixels', () => {
        // 25.4 mm = 1 inch -> at 300 DPI that is 300 px
        expect(toPixels(25.4, 'mm', 300)).toBe(300)
        // 2.54 cm = 1 inch -> at 150 DPI that is 150 px
        expect(toPixels(2.54, 'cm', 150)).toBe(150)
    })

    it('round-trips pixels <-> physical units', () => {
        const px = toPixels(50, 'mm', 300) // 50 mm at 300 dpi
        // whole-pixel rounding introduces a sub-0.05 mm error
        expect(fromPixels(px, 'mm', 300)).toBeCloseTo(50, 1)
    })

    it('returns 0 for non-positive or invalid input', () => {
        expect(toPixels(0, 'mm', 300)).toBe(0)
        expect(toPixels(-5, 'px', 150)).toBe(0)
        expect(toPixels(NaN, 'in', 300)).toBe(0)
    })

    it('rounds display values: integer pixels, 2-decimal physical', () => {
        expect(roundForUnit(1023.6, 'px')).toBe(1024)
        expect(roundForUnit(12.3456, 'mm')).toBe(12.35)
        expect(roundForUnit(2.5, 'in')).toBe(2.5)
    })
})
