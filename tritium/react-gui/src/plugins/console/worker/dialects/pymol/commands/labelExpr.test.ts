/**
 * @file plugins/console/worker/dialects/pymol/commands/labelExpr.test.ts
 * @description PyMOL label expressions, rewritten as CueMol label formats.
 *
 * The C++ label format does the formatting; what is pinned here is the
 * rewrite -- PyMOL's names mapped onto CueMol's, printf conversions onto
 * std::format specs (printf right-aligns, std::format left-aligns text), and
 * literal braces kept literal -- and that what cannot be rewritten says why.
 */

import { describe, it, expect } from 'vitest'
import { pymolLabelFormat } from './labelExpr'

describe('pymolLabelFormat', () => {
  it.each([
    ['chain', '{chain}'],
    ['resn+resi', '{resn}{resi}'],
    ['"%s-%s" % (resn, resi)', '{resn}-{resi}'],
    ['"%.2f" % b', '{bfac:.2f}'],
    ['"%5s|%-4s|%04d" % (name, resn, ID)', '{name:>5}|{resn:<4}|{aid:04d}'],
    ['"B=%d" % b', 'B={bfac:.0f}'],
    ['"CA " + str(model)', 'CA {molname}'],
    // A CueMol format passes through; a stray brace is text.
    ['"{resn} {bfac:.1f}"', '{resn} {bfac:.1f}'],
    ['"a{b"', 'a{{b'],
    ['', ''],
  ])('rewrites %s', (expr, format) => {
    expect(pymolLabelFormat(expr)).toEqual({ ok: true, format })
  })

  it.each([
    ['segi', 'segi'],
    ['"%.2f" % name', 'needs a number'],
    ['"%s %s" % resn', 'more % conversions'],
    ['resn * 2', 'not understood'],
  ])('refuses %s', (expr, reason) => {
    const res = pymolLabelFormat(expr)
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain(reason)
  })
})
