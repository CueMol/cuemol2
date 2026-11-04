/**
 * @file plugins/chimerax-console/worker/colors.ts
 * @description Reading a ChimeraX colour (`ColorArg`, `core/src/commands/colorarg.py`)
 * as CueMol's `#rrggbb`.
 *
 * What ChimeraX reads:
 * - a builtin name (`springgreen`, or with its spaces, `spring green`),
 *   matched ignoring case as `find_named_color` does; a multi-word name takes
 *   up to three words;
 * - hex: `#rgb`, `#rrggbb`, `#rrrrggggbbbb`, and the same with alpha (`#rgba`,
 *   `#rrggbbaa`, 16 digits);
 * - `rgb()` / `rgba()` / `hsl()` / `hsla()` / `gray()`: each number 0-255,
 *   0-1 when written with a decimal point, or a percentage; a hue in degrees
 *   (or `rad` / `grad` / `turn`);
 * - three or four comma-separated percentages (`100,50,0`).
 *
 * CueMol's paint has no alpha, so an alpha the colour states is reported to
 * the caller (`ColorRead.alpha`), which warns, and dropped. User-defined
 * colour names are not read.
 */

import { BUILTIN_COLORS } from './colorTables'

/** A colour read from the front of a line, and what follows it. */
export interface ColorRead {
  /** `#rrggbb`. */
  hex: string
  /** The alpha (0-1) when the colour states one explicitly, else null. */
  alpha: number | null
  rest: string
}

/** Two hex digits of a 0-1 channel. */
function hex2(v: number): string {
  return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

/** A hex colour (the digits after `#`), as rgb 0-1 and an explicit alpha. */
function readHex(h: string): { rgb: [number, number, number]; alpha: number | null } | null {
  const width = h.length === 3 || h.length === 4 ? 1 : h.length === 6 || h.length === 8 ? 2 : h.length === 12 || h.length === 16 ? 4 : 0
  if (width === 0 || !/^[0-9a-f]+$/i.test(h)) return null
  const max = 16 ** width - 1
  const channels: number[] = []
  for (let i = 0; i < h.length; i += width) channels.push(parseInt(h.slice(i, i + width), 16) / max)
  return { rgb: [channels[0], channels[1], channels[2]], alpha: channels.length === 4 ? channels[3] : null }
}

/** One number of a colour function, scaled to 0-1 (`_convert_number`). */
function scaled(n: string, unit: string, maximum: number): number | null {
  let v = Number(n)
  if (!Number.isFinite(v)) return null
  if (unit === '%') v /= 100
  else if (unit !== '') return null
  else if (!n.includes('.')) v /= maximum
  return Math.min(1, Math.max(0, v))
}

/** A hue as a fraction of a turn (`_convert_angle`). */
function hueOf(n: string, unit: string): number | null {
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  const perTurn: Readonly<Record<string, number>> = { '': 360, deg: 360, rad: 2 * Math.PI, grad: 400, turn: 1 }
  return unit in perTurn ? v / perTurn[unit] : null
}

/** `colorsys.hls_to_rgb`. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s
  const m1 = 2 * l - m2
  const v = (hue: number): number => {
    const x = ((hue % 1) + 1) % 1
    if (x < 1 / 6) return m1 + (m2 - m1) * x * 6
    if (x < 0.5) return m2
    if (x < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - x) * 6
    return m1
  }
  return [v(h + 1 / 3), v(h), v(h - 1 / 3)]
}

/** A colour function (`rgb(...)` and the others), or null when it is not one or is malformed. */
function readFunction(text: string): ColorRead | null {
  const m = /^(rgba|rgb|hsla|hsl|gray)\s*\(([^)]*)\)/i.exec(text)
  if (!m) return null
  const space = m[1].toLowerCase()
  const nums: [string, string][] = []
  for (const part of m[2].split(',')) {
    const p = /^\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s*(%|deg|grad|rad|turn|)\s*$/.exec(part)
    if (!p) return null
    nums.push([p[1], p[2]])
  }
  const n = (i: number, max = 255): number | null => scaled(nums[i][0], nums[i][1], max)
  let rgb: [number, number, number] | null = null
  let alpha: number | null = null
  if (space === 'gray' && (nums.length === 1 || nums.length === 2)) {
    const g = n(0)
    if (g !== null) rgb = [g, g, g]
    if (nums.length === 2) alpha = n(1, 1)
  } else if ((space === 'rgb' && nums.length === 3) || (space === 'rgba' && nums.length === 4)) {
    const [r, g, b] = [n(0), n(1), n(2)]
    if (r !== null && g !== null && b !== null) rgb = [r, g, b]
    if (space === 'rgba') alpha = n(3, 1)
  } else if ((space === 'hsl' && nums.length === 3) || (space === 'hsla' && nums.length === 4)) {
    const h = hueOf(nums[0][0], nums[0][1])
    const [s, l] = [n(1, 1), n(2, 1)]
    if (h !== null && s !== null && l !== null) rgb = hslToRgb(h, s, l)
    if (space === 'hsla') alpha = n(3, 1)
  }
  if (rgb === null) return null
  return { hex: rgbHex(...rgb), alpha, rest: text.slice(m[0].length).replace(/^\s+/, '') }
}

/**
 * The colour at the front of `text`, or null when there is none there.
 *
 * @param text - starts at the colour (leading white space already skipped)
 */
export function readColor(text: string): ColorRead | null {
  const hex = /^#([0-9A-Fa-f]+)(?=\s|$)/.exec(text)
  if (hex) {
    const h = readHex(hex[1])
    return h ? { hex: rgbHex(...h.rgb), alpha: h.alpha, rest: text.slice(hex[0].length).replace(/^\s+/, '') } : null
  }
  // Three or four percentages, as one token (`100,50,0`).
  const pct = /^(\d[\d.]*),([\d.]+),([\d.]+)(?:,([\d.]+))?(?=\s|$)/.exec(text)
  if (pct) {
    const [r, g, b] = [pct[1], pct[2], pct[3]].map((v) => Number(v) / 100)
    if ([r, g, b].every(Number.isFinite)) {
      return { hex: rgbHex(r, g, b), alpha: pct[4] === undefined ? null : Number(pct[4]) / 100, rest: text.slice(pct[0].length).replace(/^\s+/, '') }
    }
  }
  const fn = readFunction(text)
  if (fn) return fn
  const words = text.split(/\s+/)
  // The longest name first, so `spring green` is not read as `spring`.
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const key = words.slice(0, n).join('').toLowerCase()
    if (key in BUILTIN_COLORS) {
      const taken = new RegExp(`^(?:\\S+\\s*){${n}}`).exec(text)?.[0] ?? text
      return { hex: BUILTIN_COLORS[key], alpha: null, rest: text.slice(taken.length) }
    }
  }
  return null
}

/**
 * A colour argument's value as `ColorArg` gives it: `#rrggbb`, or
 * `#rrggbb@<alpha>` when the colour stated an alpha.
 */
export function colorArgValue(c: ColorRead): string {
  return c.alpha === null ? c.hex : `${c.hex}@${c.alpha}`
}

/** A `ColorArg` value split back into the colour and the alpha it stated (null for none). */
export function splitColorArg(value: string): { hex: string; alpha: number | null } {
  const at = value.indexOf('@')
  return at < 0 ? { hex: value, alpha: null } : { hex: value.slice(0, at), alpha: Number(value.slice(at + 1)) }
}

/** The builtin colour names, for Tab. */
export function colorNames(): string[] {
  return Object.keys(BUILTIN_COLORS)
}
