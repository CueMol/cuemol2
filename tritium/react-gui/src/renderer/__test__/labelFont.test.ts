/**
 * Pins `buildLabelFontCss` to the exact CSS shorthand produced by C++
 * `Canvas2DTextRender2::setupFont` ([italic ][bold ]<int(size)>px <name>), so
 * the settings preview stays byte-for-byte identical to the rasterised label.
 */

import { describe, it, expect } from 'vitest'
import { buildLabelFontCss } from '@renderer/features/settings/settings/labelFont'

describe('buildLabelFontCss (C++ setupFont parity)', () => {
  it('plain family + size', () => {
    expect(buildLabelFontCss({ fontName: 'sans-serif', fontSize: 12, bold: false, italic: false }))
      .toBe('12px sans-serif')
  })

  it('bold only -> weight token before size', () => {
    expect(buildLabelFontCss({ fontName: 'Helvetica', fontSize: 14, bold: true, italic: false }))
      .toBe('bold 14px Helvetica')
  })

  it('italic only -> style token before size', () => {
    expect(buildLabelFontCss({ fontName: 'Arial', fontSize: 12, bold: false, italic: true }))
      .toBe('italic 12px Arial')
  })

  it('italic + bold -> style then weight (matches C++ order)', () => {
    expect(buildLabelFontCss({ fontName: 'Georgia', fontSize: 18, bold: true, italic: true }))
      .toBe('italic bold 18px Georgia')
  })

  it('truncates fractional size to an integer (int() cast)', () => {
    expect(buildLabelFontCss({ fontName: 'Menlo', fontSize: 12.9, bold: false, italic: false }))
      .toBe('12px Menlo')
  })

  it('leaves multi-word family unquoted (CSS/canvas parse the same as C++)', () => {
    expect(buildLabelFontCss({ fontName: 'Times New Roman', fontSize: 16, bold: false, italic: false }))
      .toBe('16px Times New Roman')
  })

  it('falls back to sans-serif for an empty family / non-finite size', () => {
    expect(buildLabelFontCss({ fontName: '', fontSize: Number.NaN, bold: false, italic: false }))
      .toBe('12px sans-serif')
  })
})
