/**
 * @file plugins/chimerax-console/worker/cli/syntax.test.ts
 * @description How the ChX console reads a line, where ChimeraX's rules are not the obvious ones.
 *
 * Each case is a place a plausible simpler reader goes wrong silently: an
 * abbreviation resolved as ambiguous (ChimeraX takes the first in
 * registration order), a `#` taken as a comment inside the arguments, an
 * absent specification ending the optional arguments (`col byh` would then
 * fail), a Windows path's `\U` read as an escape.
 */

import { describe, expect, it } from 'vitest'
import { CHX_COMMANDS } from '../commands/registry'
import { bindLine, resolveWords, splitLines } from './syntax'

const resolve = (text: string) => {
  const r = resolveWords(text, CHX_COMMANDS)
  return 'error' in r ? r.error : r.spec.name
}

const bind = (text: string) => {
  const r = resolveWords(text, CHX_COMMANDS)
  if ('error' in r) throw new Error(r.error)
  return bindLine(r.spec, text)
}

describe('ChX syntax', () => {
  it('splits at ; outside quotes and drops a comment only where a command starts', () => {
    expect(splitLines('# note\ncolor #1 red; open "a;b.pdb" # x').map((l) => l.text)).toEqual([
      'color #1 red',
      'open "a;b.pdb" # x',
    ])
  })

  it('resolves a command word by the first command in registration order it starts, then sub-commands', () => {
    expect(resolve('col byh')).toBe('color')
    expect(resolve('del /B')).toBe('delete')
    expect(resolve('c :1-5')).toBe('cartoon')
    expect(resolve('cartoon hide :1-5')).toBe('cartoon hide')
    expect(resolve('cartoon h')).toBe('cartoon hide')
    // ChimeraX's short forms, which bundle order decides.
    expect(['sel', 'su', 'tr', 'tu', 'sa', 'la', 'di', 'mm', 'al'].map(resolve)).toEqual(
      ['select', 'surface', 'transparency', 'turn', 'save', 'label', 'distance', 'mmaker', 'alias'],
    )
    expect(resolve('bogus')).toMatch(/unknown command/)
  })

  it('binds positionals, then keywords by prefix, an absent specification included', () => {
    expect(bind('col byh')).toMatchObject({ kind: 'args', args: { objects: '', color: 'byhetero' } })
    expect(bind('color #1 springgreen targ c')).toMatchObject({
      kind: 'args',
      args: { objects: '#1', color: '#00ff7f', target: 'c' },
    })
    // A spec runs over spaces and operators; `atoms` is the next argument.
    expect(bind('show #1/A:10-20 & protein atoms')).toMatchObject({
      kind: 'args',
      args: { objects: '#1/A:10-20 & protein', what: 'atoms' },
    })
    // An element symbol starting the spec is no keyword: `C` is not `color`, `O` not `objects`
    // (the case of what was typed is kept, as in ChimeraX).
    expect(bind('color C & :ber red')).toMatchObject({ kind: 'args', args: { objects: 'C & :ber', color: '#ff0000' } })
    expect(bind('show O')).toMatchObject({ kind: 'args', args: { objects: 'O' } })
    // Nor is it a sub-command: `select C` is not `select clear`.
    expect(resolveWords('select C & :sti', CHX_COMMANDS)).toMatchObject({ spec: { name: 'select' }, taken: 1 })
    expect(bind('color #1 bogus')).toMatchObject({ kind: 'error' })
    expect(bind('color red target a target c')).toMatchObject({ kind: 'error', error: expect.stringMatching(/Repeated keyword/) })
  })

  it('keeps the backslashes of a quoted file name', () => {
    expect(bind('open "C:\\Users\\x.pdb"')).toMatchObject({ kind: 'args', args: { names: 'C:\\Users\\x.pdb' } })
  })
})
