/**
 * @file plugins/chimerax-console/worker/colors.ts
 * @description Reading a ChimeraX colour (`ColorArg`) as CueMol's `#rrggbb`.
 *
 * A builtin name (`springgreen`, or with its spaces, `spring green`), or a
 * hex value (`#rgb`, `#rrggbb`, `#rrggbbaa`, the alpha dropped). Colour
 * names are matched ignoring case, as `find_named_color` does; a
 * multi-word name takes up to three words. `rgb()` / `hsl()` and user-defined
 * colour names are not read yet.
 */

import { BUILTIN_COLORS } from './colorTables'

/** A colour read from the front of a line, and what follows it. */
export interface ColorRead {
  /** `#rrggbb`. */
  hex: string
  rest: string
}

function expandHex(h: string): string | null {
  if (/^[0-9a-f]{3}$/i.test(h)) return `#${[...h].map((c) => c + c).join('')}`.toLowerCase()
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return `#${h.slice(0, 6)}`.toLowerCase()
  return null
}

/**
 * The colour at the front of `text`, or null when there is none there.
 *
 * @param text - starts at the colour (leading white space already skipped)
 */
export function readColor(text: string): ColorRead | null {
  const hex = /^#([0-9A-Fa-f]+)(?=\s|$)/.exec(text)
  if (hex) {
    const h = expandHex(hex[1])
    return h ? { hex: h, rest: text.slice(hex[0].length).replace(/^\s+/, '') } : null
  }
  const words = text.split(/\s+/)
  // The longest name first, so `spring green` is not read as `spring`.
  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const key = words.slice(0, n).join('').toLowerCase()
    if (key in BUILTIN_COLORS) {
      const taken = new RegExp(`^(?:\\S+\\s*){${n}}`).exec(text)?.[0] ?? text
      return { hex: BUILTIN_COLORS[key], rest: text.slice(taken.length) }
    }
  }
  return null
}

/** The builtin colour names, for Tab. */
export function colorNames(): string[] {
  return Object.keys(BUILTIN_COLORS)
}
