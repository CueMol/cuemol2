/**
 * @file components/dialogs/exportPngSize.ts
 * @description Pure helpers for the PNG export options dialog
 * (`dialog.exportpng-opt`). Convert between an output pixel size and a physical
 * size at a chosen resolution (DPI), mirroring UXP `exportpng-opt-dlg.js`
 * `validateUnitRes` / `validateSizeText`. Pixels are the single source of
 * truth; the displayed width/height are derived for the active unit + DPI.
 */

export type PngUnit = 'mm' | 'cm' | 'in' | 'px';

/** Resolution choices offered by the dialog (UXP parity). */
export const DPI_OPTIONS = [72, 150, 300, 600] as const;

/** Inches per one unit (for physical units). */
const INCH_PER_UNIT: Record<Exclude<PngUnit, 'px'>, number> = {
    mm: 1 / 25.4,
    cm: 1 / 2.54,
    in: 1,
};

/**
 * Convert a value expressed in `unit` (at `dpi`) to whole pixels.
 * Pixel units pass through (DPI-independent); physical units use
 * `pixels = inches * dpi`.
 */
export function toPixels(value: number, unit: PngUnit, dpi: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (unit === 'px') return Math.round(value);
    return Math.round(value * INCH_PER_UNIT[unit] * dpi);
}

/**
 * Convert whole pixels to a value in `unit` (at `dpi`). Physical units are
 * returned unrounded; the caller decides display precision.
 */
export function fromPixels(px: number, unit: PngUnit, dpi: number): number {
    if (unit === 'px') return Math.round(px);
    return px / dpi / INCH_PER_UNIT[unit];
}

/** Round a display value: integers for pixels, 2 decimals for physical units. */
export function roundForUnit(value: number, unit: PngUnit): number {
    if (unit === 'px') return Math.round(value);
    return Math.round(value * 100) / 100;
}
