/**
 * @file plugins/console/worker/dialects/chimerax/spec/translate.test.ts
 * @description A ChimeraX atom specification as CueMol's expression, per model.
 *
 * The cases pin what is easy to get wrong without noticing: a residue
 * number with an insertion code read as a name, a model number applied to
 * every object, a hex colour read as a model, and a part not supported yet
 * translated into something that selects other atoms.
 */

import { describe, expect, it } from 'vitest'
import { emitFor } from './emit'
import { parseSpec, SpecError } from './parse'
import { isSelector } from './selectors'

/** The expression in model `n`, or the error. */
function inModel(spec: string, n = 1): string {
  try {
    const read = parseSpec(spec, isSelector)
    return read ? emitFor(read.node, n) : '(no spec)'
  } catch (e) {
    if (e instanceof SpecError) return `error: ${e.message}`
    throw e
  }
}

describe('atom specification translation', () => {
  it('translates the hierarchy, residue numbers and names, and the operators', () => {
    const cases: [string, string][] = [
      ['#1/A:10-20@CA', '(chain A) and ((resi 10:20) and (name CA))'],
      [':10-20,30', '(resi 10:20) or (resi 30)'],
      // An insertion code is a residue number; leading zeros are dropped for CueMol.
      [':010A-20B', 'resi 10A:20B'],
      // A name that is not a number with one letter after it.
      [':5HT', 'resn 5HT'],
      ['protein & ~:ALA', '(protein) and (not (resn ALA))'],
      ['Fe | ligand', '(elem Fe) or (ligand)'],
    ]
    for (const [spec, expr] of cases) expect([spec, inModel(spec)]).toEqual([spec, expr])
  })

  it('applies a model part only in that model', () => {
    expect([inModel('#1/A | #2/B', 1), inModel('#1/A | #2/B', 2), inModel('#1/A | #2/B', 3)]).toEqual([
      'chain A',
      'chain B',
      'none',
    ])
  })

  it('reads a hex colour as no specification, and refuses what it cannot translate', () => {
    expect(inModel('#ff0000')).toBe('(no spec)')
    expect(inModel('red')).toBe('(no spec)')
    expect(inModel('#1.2')).toMatch(/sub-model is not supported/)
    expect(inModel(':ALA@<5')).toMatch(/zone is not supported/)
    expect(inModel('ions')).toMatch(/"ions" is not supported/)
    expect(inModel('@C?')).toMatch(/"\?" wildcard is not supported/)
  })
})
