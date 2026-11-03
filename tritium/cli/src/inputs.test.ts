/**
 * @file inputs.test.ts
 * @description The runs a command line's files become, and how they are sent.
 */

import { describe, expect, it } from 'vitest'
import { UsageError } from './args'
import { appDialects } from './dialects'
import { buildSubmissions } from './inputs'
import { sendRuns } from './runs'
import type { LockApi } from './runs'

const fsys = { isFile: () => true, readText: () => 'color red' }

// What a protocol-3 app says about its dialects (`/console/info`).
const app = appDialects({
  version: '',
  build: '',
  protocol: 3,
  dialects: [
    { id: 'native', label: 'CueMol', prompt: 'CueMol>', scripts: [{ ext: '.qax', submit: 'path' }], cliColor: 'cyan' },
    { id: 'pymol', label: 'PyMOL', prompt: 'PyM>', scripts: [{ ext: '.pml', submit: 'text' }], cliColor: 'magenta' },
  ],
})

describe('buildSubmissions', () => {
  it('opens a scene alone, then loads the data and runs -c together in it', () => {
    const subs = buildSubmissions(['a.pdb', 'x.qsc', 'b (1).pdb'], 'show cartoon', 'native', '/w', fsys, app)
    expect(subs).toEqual([
      { text: 'load "/w/x.qsc"', dialect: 'native' },
      // One line each: the bracket in a path cannot swallow the next command.
      { text: 'load "/w/a.pdb"\nload "/w/b (1).pdb"\nshow cartoon', dialect: 'native' },
    ])
    // Which of two scenes the rest would go into is unclear.
    expect(buildSubmissions(['x.qsc', 'y.qsc', 'a.pdb'], null, 'native', '/w', fsys, app)).toBeInstanceOf(UsageError)
    // A script runs alone, in its own dialect.
    expect(buildSubmissions(['s.pml'], null, 'native', '/w', fsys, app)).toEqual([{ text: 'color red', dialect: 'pymol' }])
    expect(buildSubmissions(['s.pml', 'a.pdb'], null, 'native', '/w', fsys, app)).toBeInstanceOf(UsageError)
  })

  it("sends a dialect's script as its text or by its path, as the app's dialect list says", () => {
    // `path`: the app reads the file (a qax runs one undo step per action).
    expect(buildSubmissions(['s.qax'], null, 'pymol', '/w', fsys, app)).toEqual([{ scriptPath: '/w/s.qax', dialect: 'native' }])
    // An app from before scriptPath (no dialect list) is sent native `run`.
    expect(buildSubmissions(['s.qax'], null, 'native', '/w', fsys, appDialects(null))).toEqual([
      { text: 'run "/w/s.qax"', dialect: 'native' },
    ])
    // An extension no dialect claims is data to load.
    expect(buildSubmissions(['s.cxc'], null, 'native', '/w', fsys, app)).toEqual([{ text: 'load "/w/s.cxc"', dialect: 'native' }])
  })
})

describe('sendRuns', () => {
  it('holds the edit lock from before the first run to after the last, even when one fails', async () => {
    const log: string[] = []
    const lockApi: LockApi = {
      acquire: async (o) => (log.push(`acquire ${o}`), 'held'),
      release: async (o) => void log.push(`release ${o}`),
    }
    const runOne = async (s: { text?: string }, lock?: string) => (log.push(`run ${s.text} ${lock}`), s.text !== 'bad')
    const subs = [{ text: 'a', dialect: 'native' as const }, { text: 'bad', dialect: 'native' as const }, { text: 'c', dialect: 'native' as const }]
    expect(await sendRuns(subs, runOne, lockApi, 'me')).toBe(false)
    expect(log).toEqual(['acquire me', 'run a me', 'run bad me', 'release me'])
    // A single run takes no explicit lock (the app locks it for its duration).
    log.length = 0
    await sendRuns([subs[0]], runOne, lockApi, 'me')
    expect(log).toEqual(['run a undefined'])
  })
})
