/**
 * @file plugins/chimerax-console/worker/colorSchemes.ts
 * @description ChimeraX's colourings by chain and by model, and its palettes.
 *
 * The chain and model colours are ChimeraX's tables (`atomic/colors.py`
 * `chain_colors`, `atomic_color_names`). A chain id outside the table gets a
 * colour ChimeraX draws from Python's `random` seeded by the id, which
 * cannot be reproduced here: the console makes one from a hash of the id in
 * the same range, and says it differs.
 *
 * A palette (`core/colors.py` `Colormap`, `colorarg.py` `ColormapArg`) is
 * colours at positions 0..1, linearly interpolated in RGB.
 */

import { BUILTIN_COLORS } from './colorTables'
import { readColor } from './colors'

/** `atomic/colors.py` `chain_colors`, by lower-case chain id. */
const CHAIN_COLORS: Readonly<Record<string, readonly [number, number, number]>> = {
  a: [123, 104, 238], b: [240, 128, 128], c: [143, 188, 143], d: [222, 184, 135], e: [255, 127, 80],
  f: [128, 128, 128], g: [107, 142, 35], h: [100, 100, 100], i: [52, 231, 123], j: [55, 19, 112],
  k: [255, 255, 150], l: [202, 62, 94], m: [205, 145, 63], n: [183, 118, 231], o: [110, 251, 201],
  p: [175, 155, 50], q: [105, 205, 48], r: [37, 70, 25], s: [121, 33, 135], t: [83, 140, 208],
  u: [0, 154, 37], v: [178, 220, 205], w: [255, 152, 213], x: [200, 90, 174], y: [175, 200, 74],
  z: [63, 25, 12], 1: [87, 87, 87], 2: [129, 215, 234], 3: [102, 242, 126], 4: [29, 105, 20],
  5: [129, 74, 25], 6: [129, 38, 192], 7: [160, 160, 160], 8: [129, 197, 122], 9: [157, 175, 255],
  0: [41, 208, 208],
}

/** `atomic/colors.py` `atomic_color_names`: model #1, #2, ... */
const MODEL_COLOR_NAMES = ['tan', 'skyblue', 'plum', 'lightgreen', 'salmon', 'lightgray', 'deeppink', 'gold', 'dodgerblue', 'purple']

type Rgb = readonly [number, number, number]

/** `#rrggbb` from 0-255 components. */
function hex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`
}

/** 0-255 components from `#rrggbb`. */
function rgbOf(h: string): Rgb {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

/**
 * A chain's colour, case ignored as in ChimeraX.
 *
 * @returns the colour and whether it is ChimeraX's own (false: made from a hash)
 */
export function chainColor(chainId: string): { hex: string; exact: boolean } {
  const c = chainId.toLowerCase()
  const known = CHAIN_COLORS[c]
  if (known) return { hex: hex(known), exact: true }
  // FNV-1a, then three components in ChimeraX's range for unknown ids (128-255).
  let h = 0x811c9dc5
  for (const ch of c) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return { hex: hex([128 + (h & 127), 128 + ((h >>> 7) & 127), 128 + ((h >>> 14) & 127)]), exact: false }
}

/**
 * A model's colour (`structure_color`).
 *
 * @returns the colour and whether it is ChimeraX's (false past the table: it is reused)
 */
export function modelColor(model: number): { hex: string; exact: boolean } {
  const i = model - 1
  const name = MODEL_COLOR_NAMES[((i % MODEL_COLOR_NAMES.length) + MODEL_COLOR_NAMES.length) % MODEL_COLOR_NAMES.length]
  return { hex: BUILTIN_COLORS[name], exact: i >= 0 && i < MODEL_COLOR_NAMES.length }
}

/**
 * A palette: colours at ascending positions, 0 to 1 unless the text gave
 * them (`v1,c1:v2,c2`), when they are values of what is coloured
 * (`Colormap.values_specified`).
 */
export interface Palette {
  stops: { at: number; rgb: Rgb }[]
  /** The positions are values the text gave, not 0 to 1. */
  valuesGiven?: boolean
}

/** Colours spaced evenly from 0 to 1. */
function even(hexes: readonly string[]): Palette {
  return { stops: hexes.map((h, i) => ({ at: hexes.length === 1 ? 0 : i / (hexes.length - 1), rgb: rgbOf(h) })) }
}

/** `core/colors.py` `_builtin_colormaps`: the ones with evenly spaced colours, and their aliases. */
const BUILTIN_PALETTES: Readonly<Record<string, readonly string[]>> = {
  rainbow: ['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000'],
  grayscale: ['#000000', '#ffffff'],
  gray: ['#000000', '#ffffff'],
  'red-white-blue': ['#ff0000', '#ffffff', '#0000ff'],
  redblue: ['#ff0000', '#ffffff', '#0000ff'],
  'blue-white-red': ['#0000ff', '#ffffff', '#ff0000'],
  bluered: ['#0000ff', '#ffffff', '#ff0000'],
  'cyan-white-maroon': ['#0fc7cf', '#ffffff', '#9e205e'],
  cyanmaroon: ['#0fc7cf', '#ffffff', '#9e205e'],
  'cyan-gray-maroon': ['#0fc7cf', '#b3b3b3', '#9e205e'],
  lipophilicity: ['#008b8b', '#ffffff', '#b8860b'],
}

/** The default palette (`rainbow`: blue at the N-terminus, red at the C-terminus). */
export const RAINBOW: Palette = even(BUILTIN_PALETTES.rainbow)

/** One colour of a palette token. */
function tokenColor(text: string): Rgb | null {
  const c = readColor(text)
  return c && c.rest.trim() === '' ? rgbOf(c.hex) : null
}

/**
 * Read a palette as `ColormapArg` writes it: a builtin name, `c1:c2:...`,
 * or `v1,c1:v2,c2:...` (positions 0-1); `^` first reverses it.
 *
 * @returns the palette, or why the text is not one
 */
export function readPalette(text: string): { ok: true; palette: Palette } | { ok: false; error: string } {
  const reversed = text.startsWith('^')
  const body = reversed ? text.slice(1) : text
  let palette: Palette
  const parts = body.split(':')
  if (parts.length === 1) {
    const named = BUILTIN_PALETTES[body.toLowerCase()]
    if (!named) return { ok: false, error: `"${body}" is not a palette (${Object.keys(BUILTIN_PALETTES).join(', ')}, or c1:c2:...)` }
    palette = even(named)
  } else {
    const stops: { at: number | null; rgb: Rgb }[] = []
    for (const p of parts) {
      // A colour with commas in it (`rgb(1,2,3)`) reads as a colour first.
      const whole = tokenColor(p)
      const comma = p.indexOf(',')
      const rgb = whole ?? (comma > 0 ? tokenColor(p.slice(comma + 1)) : null)
      if (!rgb) return { ok: false, error: `"${p}" is not a colour` }
      stops.push({ at: whole || comma < 0 ? null : Number(p.slice(0, comma)), rgb })
    }
    const given = stops.filter((s) => s.at !== null).length
    if (given !== 0 && given !== stops.length) return { ok: false, error: 'give a position for every colour of the palette or for none' }
    palette = given === 0
      ? { stops: stops.map((s, i) => ({ at: i / (stops.length - 1), rgb: s.rgb })) }
      : { stops: stops.map((s) => ({ at: s.at as number, rgb: s.rgb })), valuesGiven: true }
    if (palette.stops.some((s, i) => Number.isNaN(s.at) || (i > 0 && s.at < palette.stops[i - 1].at))) {
      return { ok: false, error: 'palette positions must be numbers in increasing order' }
    }
  }
  if (reversed) {
    // Reversed in place: the colours swap ends, the positions stay.
    const first = palette.stops[0].at
    const last = palette.stops[palette.stops.length - 1].at
    palette = { ...palette, stops: palette.stops.map((s) => ({ at: first + last - s.at, rgb: s.rgb })).reverse() }
  }
  return { ok: true, palette }
}

/** The palette's colour at `f` (clamped to its ends), as `#rrggbb`. */
export function paletteColor(p: Palette, f: number): string {
  const s = p.stops
  if (f <= s[0].at) return hex(s[0].rgb)
  for (let i = 1; i < s.length; i++) {
    if (f <= s[i].at) {
      const t = (f - s[i - 1].at) / (s[i].at - s[i - 1].at || 1)
      return hex([0, 1, 2].map((k) => s[i - 1].rgb[k] + (s[i].rgb[k] - s[i - 1].rgb[k]) * t) as unknown as Rgb)
    }
  }
  return hex(s[s.length - 1].rgb)
}

/** ChimeraX's `alphafold` colormap (`core/colors.py`): pLDDT 0 red, 50 orange, 70 yellow, 90 cornflowerblue, 100 blue. */
const ALPHAFOLD_PALETTE: Palette = (() => {
  const r = readPalette('0,red:0.5,orange:0.7,yellow:0.9,cornflowerblue:1,blue')
  if (!r.ok) throw new Error(r.error)
  return r.palette
})()

/** The pLDDT width of one colour of `plddtEntries`: 50 colours over 0-100, close to ChimeraX's continuous map. */
export const PLDDT_STEP = 2

/** How many colours `color byattribute` uses over its range. */
export const VALUE_STEPS = 50

/** A number as CueMol's selection reads it, without float noise. */
function numText(x: number): string {
  return String(Number(x.toPrecision(6)))
}

/**
 * Paint entries colouring atoms by an atom value (`bfac`, `occ`) along a
 * palette spread over `lo`..`hi`, in `steps` colours, lowest first: put
 * first in a table one by one, the last (`bfac > ...`) ends on top and the
 * first match wins. Values outside the range take the end colours.
 *
 * @param sel - the atoms coloured ('*' for all)
 */
export function valueEntries(kw: 'bfac' | 'occ', p: Palette, lo: number, hi: number, steps: number, sel = '*'): [string, string][] {
  const first = p.stops[0].at
  const last = p.stops[p.stops.length - 1].at
  /** The palette's colour for value `v`. */
  const colorAt = (v: number) => paletteColor(p, first + ((v - lo) / (hi - lo)) * (last - first))
  const within = (expr: string) => (sel === '*' ? expr : `(${sel}) and (${expr})`)
  const out: [string, string][] = [[sel, colorAt(lo)]]
  const step = (hi - lo) / steps
  for (let i = 0; i < steps; i++) {
    const t = lo + i * step
    out.push([within(`${kw} > ${numText(t)}`), colorAt(t + step / 2)])
  }
  return out
}

/**
 * Paint entries colouring atoms by pLDDT (the B-factor column of an AlphaFold
 * model) along ChimeraX's `alphafold` colormap (`valueEntries` over 0-100).
 */
export function plddtEntries(): [string, string][] {
  return valueEntries('bfac', ALPHAFOLD_PALETTE, 0, 100, 100 / PLDDT_STEP)
}

/**
 * The value range `color byattribute` colours over (`_value_colors`): the
 * range given; else the palette's own values when it gave them; else the
 * lowest to the highest value coloured. A range of one value is widened
 * by 1 each way, as ChimeraX widens it.
 *
 * @param range - [lo, hi], 'full' (the values' own), or null (not given)
 */
export function valueRange(p: Palette, range: [number, number] | 'full' | null, min: number, max: number): [number, number] {
  let r: [number, number]
  if (Array.isArray(range)) r = range
  else if (range === null && p.valuesGiven) r = [p.stops[0].at, p.stops[p.stops.length - 1].at]
  else r = [min, max]
  return r[0] === r[1] ? [r[0] - 1, r[1] + 1] : r
}

/** How many colours `rainbow residues` uses per chain: enough to look smooth, few enough for the paint table. */
export const RAINBOW_STEPS = 64

/**
 * The paint ranges of `rainbow residues` over one chain's residues in order:
 * each residue's place along the chain (0..1) is quantised to
 * RAINBOW_STEPS colours, and consecutive residues of one colour become one
 * range.
 *
 * @param residues - the residue numbers (with insertion codes), in chain order
 * @returns [first, last, colour] per range
 */
export function rainbowRanges(residues: readonly string[], p: Palette): [string, string, string][] {
  const out: [string, string, string][] = []
  const n = residues.length
  let prev = -1
  for (let i = 0; i < n; i++) {
    const step = Math.round((n === 1 ? 0 : i / (n - 1)) * (RAINBOW_STEPS - 1))
    if (step === prev) out[out.length - 1][1] = residues[i]
    else out.push([residues[i], residues[i], paletteColor(p, step / (RAINBOW_STEPS - 1))])
    prev = step
  }
  return out
}

/** Evenly spaced colours of a palette for `n` items (`linspace(0, 1, n)`). */
export function paletteColors(p: Palette, n: number): string[] {
  return Array.from({ length: n }, (_, i) => paletteColor(p, n === 1 ? 0 : i / (n - 1)))
}

