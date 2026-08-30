/**
 * Degrade-detection tests for the colour-picker maths (`colorMath.ts`).
 *
 * Pins the UXP-ported HSB<->RGB conversions and hex packing at the colour
 * boundaries the picker relies on (primary hues, greyscale, black/white).
 * These are pure functions; if a refactor changes the rounding or the hue
 * sextant logic the slider gradients and palette tiles drift, and these
 * assertions catch it.
 */

import { describe, it, expect } from 'vitest'
import { hsbToRgb, rgbToHsb, packToHex, packToHsbString } from '@renderer/h3-kit/colorpicker'

describe('hsbToRgb', () => {
    it('maps primary hues at full sat/bri', () => {
        expect(hsbToRgb([0, 100, 100])).toEqual([255, 0, 0]) // red
        expect(hsbToRgb([120, 100, 100])).toEqual([0, 255, 0]) // green
        expect(hsbToRgb([240, 100, 100])).toEqual([0, 0, 255]) // blue
        expect(hsbToRgb([60, 100, 100])).toEqual([255, 255, 0]) // yellow
    })

    it('produces greyscale when saturation is 0', () => {
        expect(hsbToRgb([0, 0, 100])).toEqual([255, 255, 255])
        expect(hsbToRgb([0, 0, 0])).toEqual([0, 0, 0])
    })

    it('wraps hue modulo 360', () => {
        expect(hsbToRgb([360, 100, 100])).toEqual(hsbToRgb([0, 100, 100]))
    })
})

describe('rgbToHsb', () => {
    it('inverts the primary hues', () => {
        expect(rgbToHsb([255, 0, 0])).toEqual([0, 100, 100])
        expect(rgbToHsb([0, 255, 0])).toEqual([120, 100, 100])
        expect(rgbToHsb([0, 0, 255])).toEqual([240, 100, 100])
    })

    it('reports zero saturation for greys', () => {
        expect(rgbToHsb([128, 128, 128])).toEqual([0, 0, 50])
        expect(rgbToHsb([0, 0, 0])).toEqual([0, 0, 0])
    })
})

describe('packToHex', () => {
    it('zero-pads each channel', () => {
        expect(packToHex([0, 0, 0])).toBe('#000000')
        expect(packToHex([255, 255, 255])).toBe('#ffffff')
        expect(packToHex([0, 0, 255])).toBe('#0000ff')
    })

    it('clamps out-of-range channels', () => {
        expect(packToHex([300, -5, 128])).toBe('#ff0080')
    })
})

describe('packToHsbString', () => {
    it('formats saturation/brightness as 0-1 fractions (UXP convention)', () => {
        expect(packToHsbString([240, 100, 50])).toBe('hsb(240,1,0.5)')
    })
})
