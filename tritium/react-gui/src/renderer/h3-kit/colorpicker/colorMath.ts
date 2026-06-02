/**
 * @file h3-kit/colorpicker/colorMath.ts
 * @description Pure colour-space helpers for the colour picker widget.
 *
 * Ported from the UXP `cuemol2ui-lib/util.js` (`convHSB2RGB`,
 * `convRGB2HSB`, `packToHTMLColor`). Kept dependency-free so slider
 * gradients and HSB text formatting can be computed locally without an
 * IPC round-trip to the C++ StyleManager.
 *
 * Conventions match UXP: RGB components are integers 0-255; HSB is
 * hue 0-360, saturation 0-100, brightness 0-100.
 */

export type Rgb = [number, number, number]
export type Hsb = [number, number, number]

/**
 * Convert an HSB triple to RGB.
 *
 * @param hsb - [hue 0-360, saturation 0-100, brightness 0-100]
 * @returns [r, g, b] integers 0-255
 */
export function hsbToRgb(hsb: Hsb): Rgb {
    let h = hsb[0]
    let s = hsb[1]
    let v = hsb[2]

    h = ((h % 360) + 360) % 360
    s /= 100
    v /= 100
    h /= 60

    const i = Math.floor(h)
    const f = h - i
    const p = v * (1 - s)
    const q = v * (1 - s * f)
    const t = v * (1 - s * (1 - f))

    let r = 0
    let g = 0
    let b = 0
    if (i === 0) {
        r = v
        g = t
        b = p
    } else if (i === 1) {
        r = q
        g = v
        b = p
    } else if (i === 2) {
        r = p
        g = v
        b = t
    } else if (i === 3) {
        r = p
        g = q
        b = v
    } else if (i === 4) {
        r = t
        g = p
        b = v
    } else {
        r = v
        g = p
        b = q
    }

    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)]
}

/**
 * Convert an RGB triple to HSB.
 *
 * @param rgb - [r, g, b] integers 0-255
 * @returns [hue 0-360, saturation 0-100, brightness 0-100]
 */
export function rgbToHsb(rgb: Rgb): Hsb {
    const red = rgb[0] / 255
    const grn = rgb[1] / 255
    const blu = rgb[2] / 255

    const x = Math.min(red, grn, blu)
    const val = Math.max(red, grn, blu)

    if (x === val) {
        return [0, 0, Math.floor(val * 100)]
    }

    const f = red === x ? grn - blu : grn === x ? blu - red : red - grn
    const i = red === x ? 3 : grn === x ? 5 : 1
    const hue = (Math.floor((i - f / (val - x)) * 60) + 360) % 360
    const sat = Math.floor(((val - x) / val) * 100)

    return [hue, sat, Math.floor(val * 100)]
}

/**
 * Pack an RGB triple into a CSS `#rrggbb` hex string.
 *
 * @param rgb - [r, g, b] integers 0-255
 * @returns lower-case `#rrggbb`
 */
export function packToHex(rgb: Rgb): string {
    const hex = (v: number): string => {
        const clamped = Math.max(0, Math.min(255, Math.round(v)))
        return (clamped < 16 ? '0' : '') + clamped.toString(16)
    }
    return '#' + hex(rgb[0]) + hex(rgb[1]) + hex(rgb[2])
}

/**
 * Format an HSB triple as the CueMol `hsb(h,s,b)` colour string, matching
 * UXP `updateMain` (saturation/brightness expressed as 0-1 fractions).
 *
 * @param hsb - [hue 0-360, saturation 0-100, brightness 0-100]
 */
export function packToHsbString(hsb: Hsb): string {
    return `hsb(${hsb[0]},${hsb[1] / 100},${hsb[2] / 100})`
}
