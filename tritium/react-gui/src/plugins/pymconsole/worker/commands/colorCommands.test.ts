/**
 * @file plugins/pymconsole/worker/commands/colorCommands.test.ts
 * @description What `spectrum` and `set_color` turn PyMOL's arguments into.
 *
 * `spectrum` has to refuse what CueMol's two gradients cannot draw rather
 * than produce a different picture, and `set_color` has to read PyMOL's two
 * number ranges the way PyMOL does.
 */

import { describe, it, expect } from 'vitest'
import { parseRgb, planSpectrum } from './colorCommands'

describe('spectrum', () => {
  it.each([
    ['b', 'blue_red', { kind: 'bfac', mode: 'bfac', low: '#0000ff', high: '#ff0000' }],
    ['q', 'green_yellow', { kind: 'bfac', mode: 'occ' }],
    ['count', 'rainbow', { kind: 'rainbow', startHue: 240, endHue: 0 }],
    ['resi', 'rainbow_rev', { kind: 'rainbow', startHue: 0, endHue: 240 }],
  ])('draws %s with %s', (expr, palette, expected) => {
    expect(planSpectrum(expr, palette)).toMatchObject(expected)
  })

  it.each([
    // PyMOL's default: a rainbow over B-factors, which CueMol cannot draw.
    ['b', 'rainbow'],
    ['b', 'blue_white_red'],
    ['count', 'blue_red'],
    ['pc', 'rainbow'],
  ])('refuses %s with %s', (expr, palette) => {
    expect(planSpectrum(expr, palette)).toHaveProperty('error')
  })
})

describe('set_color', () => {
  it('reads 0-1 and 0-255 lists, and hex', () => {
    expect(parseRgb('[1.0, 0.5, 0.0]')).toBe('#ff8000')
    // Any value above 1 means the whole list is 0-255.
    expect(parseRgb('[255, 128, 0]')).toBe('#ff8000')
    expect(parseRgb('0xFF8000')).toBe('#ff8000')
    expect(parseRgb('[1, 2]')).toBeNull()
  })
})
