/**
 * @file plugins/chimerax-console/worker/colors.test.ts
 * @description ChimeraX's colour syntax (`colorarg.py`) as CueMol's `#rrggbb`.
 *
 * The scaling rules differ by how a number is written -- 0-255 as an
 * integer, 0-1 with a decimal point, a percentage with `%` -- and a bare
 * comma triple is in percent; reading one the other way gives a wrong
 * colour without an error. An alpha the colour states is kept apart, so
 * the command can say it is dropped.
 */

import { describe, expect, it } from 'vitest'
import { readColor } from './colors'

describe('ChimeraX colours', () => {
  it('reads names, hex, the colour functions and percentages', () => {
    const cases: [string, string, number | null][] = [
      ['spring green', '#00ff7f', null],
      ['#f80', '#ff8800', null],
      ['#ff000080', '#ff0000', 128 / 255],
      ['rgb(255,128,0)', '#ff8000', null],
      ['rgb(1.0,0.5,0)', '#ff8000', null],
      ['rgba(100%,0%,0%,0.5)', '#ff0000', 0.5],
      ['hsl(120,100%,50%)', '#00ff00', null],
      ['hsl(0.5turn,100%,50%)', '#00ffff', null],
      ['gray(50%)', '#808080', null],
      ['100,50,0', '#ff8000', null],
    ]
    for (const [text, hex, alpha] of cases) {
      const c = readColor(text)
      expect([text, c?.hex, c?.alpha ?? null]).toEqual([text, hex, alpha === null ? null : expect.closeTo(alpha, 5)])
    }
  })
})
