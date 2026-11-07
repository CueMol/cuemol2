/**
 * @file plugins/pymol-console/worker/commands/colorCommands.test.ts
 * @description What `spectrum` and `set_color` turn PyMOL's arguments into.
 *
 * `spectrum` has to refuse what CueMol's gradients cannot draw rather than
 * produce a different picture, spread a multi-colour palette the way PyMOL's
 * `spectrumany` does, and `set_color` has to read PyMOL's two number ranges
 * the way PyMOL does.
 */

import { describe, it, expect } from 'vitest'
import { parseRgb, planSpectrum, spectrumNodes } from './colorCommands'

describe('spectrum', () => {
  it.each([
    ['b', 'blue_red', { kind: 'bfac', mode: 'bfac', low: '#0000ff', high: '#ff0000' }],
    ['q', 'green_yellow', { kind: 'bfac', mode: 'occ' }],
    ['b', 'blue red', { kind: 'bfac', low: '#0000ff', high: '#ff0000' }],
    ['count', 'rainbow', { kind: 'rainbow', startHue: 240, endHue: 0 }],
    ['resi', 'rainbow_rev', { kind: 'rainbow', startHue: 0, endHue: 240 }],
    // Three colours or more: a multi-colour gradient, by name or by colours.
    ['b', 'rainbow', { kind: 'bfacGrad', mode: 'bfac', colors: ['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff8000', '#ff0000'] }],
    ['q', 'blue_white_red', { kind: 'bfacGrad', mode: 'occ', colors: ['#0000ff', '#ffffff', '#ff0000'] }],
  ])('draws %s with %s', (expr, palette, expected) => {
    expect(planSpectrum(expr, palette)).toMatchObject(expected)
  })

  it.each([
    ['b', 'blue_notacolour_red'],
    ['count', 'blue_red'],
    ['pc', 'rainbow'],
  ])('refuses %s with %s', (expr, palette) => {
    expect(planSpectrum(expr, palette)).toHaveProperty('error')
  })

  it('spreads the colours evenly from the minimum to the maximum', () => {
    expect(spectrumNodes(['#0000ff', '#ffffff', '#ff0000'], 10, 30)).toBe('10 #0000ff; 20 #ffffff; 30 #ff0000')
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
