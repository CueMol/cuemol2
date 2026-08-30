/**
 * @file features/settings/settings/labelFont.ts
 * @description Shared helpers for the atom-label font settings: building the
 * CSS font shorthand (byte-for-byte matching the C++ label renderer so the
 * settings preview is true WYSIWYG) and the generic / fallback font families.
 */

export interface LabelFontSpec {
  fontName: string
  fontSize: number
  bold: boolean
  italic: boolean
}

/**
 * Build the CSS `font` shorthand exactly as C++ `Canvas2DTextRender2::setupFont`
 * does (`[italic ][bold ]<int(size)>px <fontName>`), so a preview rendered with
 * this string matches the rasterised 3D label. Size is truncated to an integer
 * to mirror the C++ `int(fontsize)` cast; the family is left unquoted (same as
 * C++), which CSS/canvas parse identically.
 *
 * @returns e.g. `"italic bold 14px Helvetica"` or `"12px sans-serif"`.
 */
export function buildLabelFontCss(spec: LabelFontSpec): string {
  const size = Number.isFinite(spec.fontSize) ? Math.trunc(spec.fontSize) : 12
  const parts: string[] = []
  if (spec.italic) parts.push('italic')
  if (spec.bold) parts.push('bold')
  parts.push(`${size}px`)
  parts.push(spec.fontName || 'sans-serif')
  return parts.join(' ')
}

/** CSS generic families, offered at the top of the font list (UXP parity). */
export const GENERIC_FONT_FAMILIES: string[] = [
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
]

/**
 * Curated cross-platform families used when the Local Font Access API is
 * unavailable or denied, so the picker is never empty. Kept small and common;
 * the real system list (via `queryLocalFonts`) supersedes it when available.
 */
export const FALLBACK_FONT_FAMILIES: string[] = [
  'Helvetica',
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Menlo',
  'Monaco',
  'Consolas',
]

/**
 * The pre-load / no-system-fonts font list (generics + curated families). Used
 * as the SettingsPane font-select fallback before `queryLocalFonts` resolves or
 * when it is unavailable.
 */
export const FALLBACK_FONT_LIST: string[] = [
  ...GENERIC_FONT_FAMILIES,
  ...FALLBACK_FONT_FAMILIES,
]
