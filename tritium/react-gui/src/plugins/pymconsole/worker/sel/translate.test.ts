/**
 * @file plugins/pymconsole/worker/sel/translate.test.ts
 * @description Where a PyMOL selection means something other than it looks.
 *
 * The cases here are the ones a regex-based rewrite gets wrong without
 * erroring: the two meanings of `-`, the two meanings of `+`, and operator
 * priorities that differ from left-to-right. A selection that silently
 * matches the wrong atoms is the failure worth spending tests on -- an
 * expression CueMol rejects at least says so.
 */

import { describe, it, expect } from 'vitest'
import { selectionKeywords, translateSelection } from './translate'

/** The expression, or the error, as one string. */
function tr(expr: string): string {
  const r = translateSelection(expr)
  return r.ok ? r.expr : r.error
}

describe('the two meanings of -', () => {
  it('reads a dash inside a word as a residue range', () => {
    expect(tr('resi 1-10')).toBe('resi 1:10')
  })

  it('reads a dash standing alone as subtraction', () => {
    // CueMol has no subtraction operator, so it is spelled out.
    expect(tr('chain A - resi 5')).toBe('(chain A) and not (resi 5)')
  })

  it('keeps negative residue numbers, and ranges between them', () => {
    expect(tr('resi -5--1')).toBe('resi -5:-1')
  })
})

describe('the two meanings of +', () => {
  it('reads a plus inside a word as a value list', () => {
    expect(tr('name CA+CB')).toBe('name CA,CB')
  })

  it('reads a plus standing alone as a union', () => {
    expect(tr('chain A + chain B')).toBe('(chain A) or (chain B)')
  })
})

describe('operator priorities', () => {
  it('binds and tighter than or, whatever the order written', () => {
    expect(tr('chain A or chain B and resi 1')).toBe(
      '(chain A) or ((chain B) and (resi 1))',
    )
  })

  it('applies around to the whole union, not the last term', () => {
    // `around` binds looser than `or` in both languages; parenthesising
    // every operand is what keeps that true through the round trip.
    expect(tr('chain A or chain B around 5')).toBe(
      '((chain A) or (chain B)) around 5',
    )
  })

  it('applies byres to everything after it', () => {
    expect(tr('byres chain A and resi 1')).toBe(
      'byres ((chain A) and (resi 1))',
    )
  })
})

describe('class macros', () => {
  it('uses the aliases CueMol already defines', () => {
    expect(tr('polymer')).toBe('(protein) or (nucleic)')
    expect(tr('solvent')).toBe('water')
  })

  it('spells out the ones CueMol has no alias for', () => {
    expect(tr('backbone')).toContain('name N,CA,C,O,OXT')
  })

  it('maps the secondary-structure letters', () => {
    expect(tr('ss H')).toBe('(helix)')
    expect(tr('ss H+S')).toBe('(helix) or (sheet)')
  })
})

describe('what cannot be carried across', () => {
  it('names the property rather than reading it as an object', () => {
    // `segi A` parsed as a bare name would select nothing and look fine.
    expect(tr('segi A')).toContain('CueMol has no segment identifiers')
  })

  it('refuses the operators CueMol parses but never implemented', () => {
    expect(tr('chain A extend 2')).toContain('never implemented')
  })

  it('refuses a directional two-set operator', () => {
    expect(tr('chain A within 5 of chain B')).toContain('directional two-set')
  })

  it('refuses a comparison CueMol does not have', () => {
    expect(tr('b <= 30')).toContain('only <, > and =')
  })

  it('points at the word that failed', () => {
    const expr = 'chain A and segi B'
    const [, caretLine] = tr(expr).split('\n')
    expect(caretLine.indexOf('^')).toBe(expr.indexOf('segi'))
  })
})

describe('what passes through', () => {
  it('keeps a bare name as a name', () => {
    expect(tr('1crn')).toBe('1crn')
  })

  it('renames the properties CueMol spells differently', () => {
    expect(tr('b < 30')).toBe('bfac < 30')
    expect(tr('id 5')).toBe('aid 5')
  })
})

describe('the keywords offered for completion', () => {
  it('offers only keywords that translate', () => {
    // Tab completion takes its selection candidates from this list, so a
    // keyword left in it after the emitter stopped accepting it would
    // complete a line straight into an error. Each one is tried with a value
    // where it needs one; failing here means the list and the translator have
    // drifted apart.
    const sample: Readonly<Record<string, string>> = {
      'resi ': '1', 'name ': 'CA', 'elem ': 'C', 'resn ': 'ALA', 'chain ': 'A',
      'alt ': 'A', 'id ': '1', 'ss ': 'H', 'b ': '< 30', 'q ': '< 1',
      'byres ': 'chain A', 'around ': '5', 'expand ': '5', 'not ': 'chain A',
    }
    for (const keyword of selectionKeywords()) {
      // The infix operators cannot stand at the head of an expression.
      if (keyword === 'and ' || keyword === 'or ') continue
      const suffix = sample[keyword] ?? ''
      const expr =
        keyword === 'around ' || keyword === 'expand '
          ? `chain A ${keyword}${suffix}`
          : `${keyword}${suffix}`
      expect({ keyword, ...translateSelection(expr) }).toMatchObject({ ok: true })
    }
  })
})
