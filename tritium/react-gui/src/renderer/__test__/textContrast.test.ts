/**
 * @file __test__/textContrast.test.ts
 * @description Degrade-detection contract for how legible the text tokens in
 * `styles/_variables.css` are.
 *
 * The dark theme's `--text-muted` had drifted to a WCAG contrast ratio of 2.26
 * against the panel surface -- dimmer than Blueprint's own DISABLED tone, which
 * is what made the scene-tree carets, the pane-header icon buttons and the
 * form carets hard to see. Nothing caught it, because a colour token is just a
 * hex string until it is put next to a background.
 *
 * So this computes the real ratios and pins two things:
 *   - a floor per token, so no single value can drift back down, and
 *   - the ORDER of the ladder (primary > secondary > muted > disabled), so a
 *     later tweak cannot make "muted" brighter than "secondary" and leave the
 *     names meaning nothing.
 *
 * Floors are deliberately below the current values: this is a ratchet against
 * regression, not a spec for the exact colours, which stay a design choice.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const css = readFileSync(
  resolve(process.cwd(), 'src/renderer/styles/_variables.css'),
  'utf8',
)

/** Extract the body of a selector block by its exact selector text. */
function block(selector: string): string {
  const idx = css.indexOf(selector)
  if (idx < 0) throw new Error(`selector not found: ${selector}`)
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

/** Read one token's literal hex value from a block. */
function hex(body: string, token: string): string {
  const m = new RegExp(`${token}\\s*:\\s*(#[0-9a-f]{6})\\b`, 'i').exec(body)
  if (!m) throw new Error(`${token} is not declared as a 6-digit hex`)
  return m[1]
}

/** WCAG relative luminance. */
function luminance(color: string): number {
  const h = color.slice(1)
  const chan = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2]
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const dark = block(':root')
const light = block(':root[data-theme="light"]')

/**
 * The panel surface every side pane, dialog and inspector row sits on -- the
 * background these tones are actually read against.
 */
const DARK_BG = hex(dark, '--bg-surface')
const LIGHT_BG = hex(light, '--bg-surface')

/** Minimum ratio each tone must keep against the panel surface. */
const FLOORS: Record<string, number> = {
  '--text-strong': 10,
  '--text-primary': 8,
  '--text-secondary': 5.5,
  '--text-muted': 4.5,
  '--text-disabled': 3,
}

/** Brightest first; every step must be strictly dimmer than the one before. */
const LADDER = [
  '--text-strong',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-disabled',
]

describe('text tokens: dark theme legibility', () => {
  it.each(Object.entries(FLOORS))(
    '%s stays at or above its contrast floor',
    (token, floor) => {
      const ratio = contrastRatio(hex(dark, token), DARK_BG)
      expect(
        Number(ratio.toFixed(2)),
        `${token} reads at ${ratio.toFixed(2)}:1 on ${DARK_BG}, below the ${floor}:1 floor`,
      ).toBeGreaterThanOrEqual(floor)
    },
  )

  it('keeps the tones in order, brightest to dimmest', () => {
    const ratios = LADDER.map((t) => contrastRatio(hex(dark, t), DARK_BG))
    for (let i = 1; i < LADDER.length; i++) {
      expect(
        ratios[i],
        `${LADDER[i]} (${ratios[i].toFixed(2)}) is not dimmer than ${LADDER[i - 1]} (${ratios[i - 1].toFixed(2)})`,
      ).toBeLessThan(ratios[i - 1])
    }
  })

  it('keeps disabled dimmer than the dimmest enabled tone', () => {
    // The whole reason --text-disabled was split out of --text-muted: sharing
    // one value made an enabled control and a disabled one look identical.
    expect(contrastRatio(hex(dark, '--text-disabled'), DARK_BG)).toBeLessThan(
      contrastRatio(hex(dark, '--text-muted'), DARK_BG),
    )
  })
})

describe('text tokens: light theme legibility', () => {
  // The light theme was already legible and its values are unchanged; this
  // pins the two tones carrying real content so a dark-side edit copied across
  // cannot quietly wash them out.
  it.each([
    ['--text-primary', 8],
    ['--text-secondary', 5],
  ])('%s stays at or above its contrast floor', (token, floor) => {
    const ratio = contrastRatio(hex(light, token), LIGHT_BG)
    expect(
      Number(ratio.toFixed(2)),
      `${token} reads at ${ratio.toFixed(2)}:1 on ${LIGHT_BG}`,
    ).toBeGreaterThanOrEqual(floor)
  })
})
