/**
 * @file __test__/styleTokens.test.ts
 * @description Degrade-detection contract for the design-token layer in
 * `styles/_variables.css`.
 *
 * These tests do not check pixel values; they pin the *structure* of the
 * token system so a future edit cannot silently:
 *   - add a theme colour in dark mode but forget the light override,
 *   - drop one of the spacing / size / radius token families,
 *   - or detach the font tokens from the `--ui-scale` hook.
 *
 * The file is parsed as text (jsdom does not resolve CSS custom properties
 * via getComputedStyle), extracting the `:root` and
 * `:root[data-theme="light"]` blocks.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Vitest runs with cwd at the react-gui package root.
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

/** Names of all custom properties declared in a block, e.g. "--bg-base". */
function tokenNames(body: string): Set<string> {
  const names = new Set<string>()
  const re = /(--[a-z0-9-]+)\s*:/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) names.add(m[1])
  return names
}

const darkTokens = tokenNames(block(':root'))
const lightTokens = tokenNames(block(':root[data-theme="light"]'))

// Core theme colours that MUST differ per theme -- a missing light override
// is almost always a bug (text/background would render with dark values on a
// light theme). Sizes / scale tokens are intentionally theme-independent and
// are not listed here.
const MUST_PAIR = [
  '--bg-base', '--bg-surface', '--bg-elevated', '--bg-panel-header', '--bg-input',
  '--bg-hover', '--bg-active', '--bg-tab-active', '--bg-tab-inactive',
  '--border', '--border-subtle',
  '--text-primary', '--text-secondary', '--text-muted', '--text-strong',
  '--accent', '--accent-green', '--accent-red',
  '--toolbar-bg', '--statusbar-bg', '--statusbar-text',
]

describe('design tokens: theme pairing', () => {
  it('defines every core theme colour in both dark and light', () => {
    for (const t of MUST_PAIR) {
      expect(darkTokens, `${t} missing from :root`).toContain(t)
      expect(lightTokens, `${t} missing from light theme override`).toContain(t)
    }
  })

  it('does not declare orphan tokens in the light block', () => {
    // Everything the light theme overrides must also exist in :root.
    for (const t of lightTokens) {
      expect(darkTokens, `light defines ${t} but :root does not`).toContain(t)
    }
  })
})

describe('design tokens: families exist', () => {
  const families = [
    ['--space-0', '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6'],
    ['--ctrl-h-sm', '--ctrl-h-md', '--ctrl-h-lg', '--panel-header-h'],
    ['--icon-sm', '--icon-md', '--icon-lg'],
    ['--radius-sm', '--radius-md', '--radius-lg'],
  ].flat()

  it('declares the full spacing / size / radius scale', () => {
    for (const t of families) {
      expect(darkTokens, `${t} not defined`).toContain(t)
    }
  })
})

describe('design tokens: font scale hook', () => {
  it('defines --ui-scale defaulting to 1', () => {
    expect(darkTokens).toContain('--ui-scale')
    expect(block(':root')).toMatch(/--ui-scale\s*:\s*1\s*;/)
  })

  it('routes every --fs-* token through var(--ui-scale)', () => {
    const body = block(':root')
    const re = /(--fs-[a-z0-9-]+)\s*:\s*([^;]+);/gi
    let m: RegExpExecArray | null
    let count = 0
    while ((m = re.exec(body)) !== null) {
      count++
      expect(m[2], `${m[1]} should scale with --ui-scale`).toContain('var(--ui-scale)')
    }
    expect(count).toBeGreaterThan(0)
  })
})
