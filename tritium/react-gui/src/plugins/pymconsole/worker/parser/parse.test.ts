/**
 * @file plugins/pymconsole/worker/parser/parse.test.ts
 * @description The parts of PyMOL's grammar that would break a script if we
 * got them wrong.
 *
 * Not a survey of the grammar: each case is one rule where a plausible
 * simpler implementation gives a different answer, and where the difference
 * is silent rather than an error.
 */

import { describe, it, expect } from 'vitest'
import { splitCommands } from './splitCommands'
import { ParseError, parseArgs } from './parseArgs'
import { BindError, bindArgs } from './bindArgs'
import { lookupCommand } from './commandLookup'

describe('splitCommands', () => {
  it('does not cut on a semicolon inside brackets or quotes', () => {
    // `text.split(';')` would make three commands out of this one.
    const cmds = splitCommands('select foo, (chain A; chain B); zoom "a;b"')
    expect(cmds.map((c) => c.text)).toEqual(['select foo, (chain A; chain B)', 'zoom "a;b"'])
  })

  it('drops comments and blank lines, and joins continuations', () => {
    const cmds = splitCommands('# a note\n\nload a.pdb, \\\nfoo\n')
    expect(cmds.map((c) => c.text)).toEqual(['load a.pdb, foo'])
  })

  it('reads the prefixes that change what a line means', () => {
    const cmds = splitCommands('_ zoom\n/print(1)\n@script.pml')
    expect(cmds.map((c) => [c.text, c.quiet, c.python, c.script])).toEqual([
      ['zoom', true, false, false],
      ['print(1)', false, true, false],
      ['script.pml', false, false, true],
    ])
  })
})

describe('parseArgs', () => {
  it('keeps a bracketed group with its commas as one argument', () => {
    expect(parseArgs('zoom (chain A, chain B), 2')).toEqual([
      { name: null, value: '(chain A, chain B)' },
      { name: null, value: '2' },
    ])
  })

  it('reads named arguments, quotes and blanks', () => {
    expect(parseArgs('load "a b.pdb",, object=foo')).toEqual([
      { name: null, value: '"a b.pdb"' },
      { name: null, value: null },
      { name: 'object', value: 'foo' },
    ])
  })

  it('takes everything after the first argument literally in literal1 mode', () => {
    expect(parseArgs('alter chain A, b=1, q=2', 'literal1')).toEqual([
      { name: null, value: 'chain A' },
      { name: null, value: 'b=1, q=2' },
    ])
  })

  it('reports brackets that open more than they close', () => {
    // PyMOL only reaches its "syntax error (type 1)" when a closing bracket
    // exists but the nesting never balances. A group with no closer at all
    // is passed through as a plain value, for the selection compiler to
    // complain about -- so that case is checked too, to pin which is which.
    expect(() => parseArgs('zoom ((chain A)')).toThrow(ParseError)
    expect(parseArgs('zoom (chain A')).toEqual([{ name: null, value: '(chain A' }])
  })
})

describe('bindArgs', () => {
  const params = [{ name: 'name' }, { name: 'value', default: '1' }]

  it('fills defaults and binds by position then by name', () => {
    const r = bindArgs('set', params, [
      { name: null, value: 'ambient' },
    ])
    expect(r).toEqual({ kind: 'args', args: { name: 'ambient', value: '1' } })
  })

  it('expands an unknown name into two values in legacy mode', () => {
    // `set ambient=0.3` is a value pair, not a named argument.
    const r = bindArgs('set', params, [{ name: 'ambient', value: '0.3' }], 'legacy')
    expect(r).toEqual({ kind: 'args', args: { name: 'ambient', value: '0.3' } })
  })

  it('rejects an unknown name in strict mode', () => {
    expect(() => bindArgs('set', params, [{ name: 'nope', value: '1' }])).toThrow(BindError)
  })

  it('rejects too many positional arguments and a missing required one', () => {
    expect(() =>
      bindArgs('set', params, [
        { name: null, value: 'a' },
        { name: null, value: 'b' },
        { name: null, value: 'c' },
      ]),
    ).toThrow(BindError)
    expect(() => bindArgs('set', params, [])).toThrow(BindError)
  })

  it('answers a lone ? with the usage line', () => {
    expect(bindArgs('set', params, [{ name: null, value: '?' }])).toEqual({
      kind: 'usage',
      usage: 'Usage: set name [, value ]',
    })
  })
})

describe('lookupCommand', () => {
  const names = ['set', 'set_name', 'select', 'show', 'bg_color']

  it('prefers an exact name over any abbreviation', () => {
    expect(lookupCommand('set', names)).toEqual({ kind: 'found', name: 'set' })
  })

  it('accepts a unique prefix and an underscore abbreviation', () => {
    expect(lookupCommand('sho', names)).toEqual({ kind: 'found', name: 'show' })
    expect(lookupCommand('b_c', names)).toEqual({ kind: 'found', name: 'bg_color' })
  })

  it('lists the candidates when a prefix is ambiguous', () => {
    expect(lookupCommand('se', names)).toEqual({
      kind: 'ambiguous',
      candidates: ['select', 'set', 'set_name'],
    })
  })
})
