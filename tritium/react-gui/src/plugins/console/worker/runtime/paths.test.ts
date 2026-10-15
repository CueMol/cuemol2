/**
 * @file plugins/console/worker/runtime/paths.test.ts
 * @description How a load's path list is read: split as zsh splits words,
 * and a pattern expanded as zsh expands it.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { expandGlob, pathWord, readPathList, splitPathWords } from './paths'

describe('a path list', () => {
  it('splits on spaces, keeps quoted and escaped text literal, and writes a path back the same way', () => {
    const words = splitPathWords(`a.pdb  "My Data/b.pdb" My\\ Data/c*.pdb 'd*.pdb' C:\\x\\e.pdb`)
    expect(words.map((w) => [w.value, w.glob])).toEqual([
      ['a.pdb', false],
      ['My Data/b.pdb', false],
      ['My Data/c*.pdb', true],
      ['d*.pdb', false],
      // A backslash before anything else is a Windows separator, not an escape.
      ['C:\\x\\e.pdb', false],
    ])
    expect(splitPathWords(pathWord('My Data/f*.pdb'))[0]).toMatchObject({ value: 'My Data/f*.pdb', glob: false })
  })

  it('expands a pattern level by level, as typed, without dot files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuemol-glob-'))
    for (const d of ['set1', 'set2', '.cache']) fs.mkdirSync(path.join(dir, d))
    for (const f of ['set1/b.pdb', 'set1/a.pdb', 'set2/c.pdb', 'set2/c.txt', '.cache/x.pdb', 'set1/.y.pdb']) {
      fs.writeFileSync(path.join(dir, f), '')
    }
    expect(expandGlob(dir, '*/*.pdb')).toEqual(['set1/a.pdb', 'set1/b.pdb', 'set2/c.pdb'])
    expect(expandGlob(dir, `${dir}/set?/c.*`)).toEqual([`${dir}/set2/c.pdb`, `${dir}/set2/c.txt`])
    expect(expandGlob(dir, 'set1/.*')).toEqual(['set1/.y.pdb'])

    const list = readPathList(dir, 'set2/c.txt set1/*.pdb zz*')
    expect(list).toEqual({ files: ['set2/c.txt', 'set1/a.pdb', 'set1/b.pdb'], unmatched: ['zz*'], glob: true })
  })
})
