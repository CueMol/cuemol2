/**
 * @file plugins/chimerax-console/worker/spec/translate.test.ts
 * @description A ChimeraX atom specification as CueMol's expression, per model.
 *
 * The cases pin what is easy to get wrong without noticing: a residue
 * number with an insertion code read as a name, a model number applied to
 * every object, a hex colour read as a model, a wildcard passed through as a
 * literal character (which then matches nothing), a zone that forgets the
 * other models, and a part not supported yet translated into something that
 * selects other atoms.
 */

import { describe, expect, it } from 'vitest'
import { emitFor } from './emit'
import type { EmitContext } from './emit'
import { parseSpec, SpecError } from './parse'
import { isSelector } from './selectors'

/** Two molecules, #1 `1abc` and #2 `2xyz`; every expression hits chain A only. */
const scene: EmitContext = {
  models: [{ model: 1, name: '1abc' }, { model: 2, name: '2xyz' }],
  chainsHit: () => ['A'],
  anyHit: () => true,
}

/** The expression in model `n`, or the error. */
function inModel(spec: string, n = 1): string {
  try {
    const read = parseSpec(spec, isSelector)
    return read ? emitFor(read.node, n, scene) : '(no spec)'
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
      // Wildcards are CueMol regular expressions, not literal characters.
      ['@C*', 'name /(?i)^C.*$/'],
      [':A?A', 'resn /(?i)^A.A$/'],
      [':start-5', 'resi -99999:5'],
      // Attribute tests.
      ['@@bfactor>50', 'bfac > 50'],
      ['@@occupancy>=0.5', 'not (occ < 0.5)'],
      ['::name=THR', 'resn THR'],
      ['::number<10', 'resi -99999:9'],
      ['::polymer_type=2', 'nucleic'],
      ['::^is_helix', 'not (helix)'],
      ['@@name==ca', 'name /^ca$/'],
      // A zone reaches the other model too, and keeps the reference atoms (`expand`).
      [':CYS :< 4', 'byres (((resn CYS) expand 4) or ((resn CYS) around 4 ["2xyz"]))'],
      ['ligand @> 5', 'not (((ligand) expand 5) or ((ligand) around 5 ["2xyz"]))'],
      ['ligand /< 5', 'chain A'],
      ['##name=2x*', 'none'],
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
    expect(inModel('ions')).toMatch(/"ions" is not supported/)
    expect(inModel('@@idatm_type=C3')).toMatch(/attribute "idatm_type" is not supported/)
  })
})
