/**
 * @file plugins/console/worker/completion/complete.test.ts
 * @description The rules Tab follows, where PyMOL's answer is not the obvious
 * one.
 *
 * Each case is a place where a plausible simpler implementation behaves
 * differently and does so silently: completing `set` to itself instead of
 * listing its siblings, counting a comma inside `[...]` as an argument
 * boundary, appending a separator to a partial completion. None of those
 * would fail loudly.
 *
 * The candidate sources are stubbed: what is under test is the algorithm, not
 * whether the scene really holds an object of that name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { ConsoleCommand as PymCommand, ConsoleDialect } from '../runtime/types'

// Built inside `vi.hoisted` because the mock factories below are hoisted
// above the module body and would otherwise read these before they exist.
const { COMMANDS, candidates } = vi.hoisted(() => {
  /** A command that exists only to carry completion entries. */
  function stub(name: string, completions?: unknown): Record<string, unknown> {
    return {
      name,
      params: [{ name: 'a', default: '' }, { name: 'b', default: '' }],
      mode: 'strict',
      mutates: false,
      summary: 'stub',
      ...(completions ? { completions } : {}),
      run: () => ({ ok: true }),
    }
  }
  return {
    COMMANDS: [
      stub('set', [
        { source: 'settings', description: 'setting', suffix: ', ' },
        { source: 'settingValue', description: 'value', suffix: ', ' },
      ]),
      stub('set_name', [{ source: 'names', description: 'name', suffix: ', ' }]),
      stub('select'),
      stub('bg_color', [{ source: 'colors', description: 'color', suffix: '' }]),
      stub('load'),
    ] as unknown as PymCommand[],
    candidates: vi.fn(),
  }
})

import { completeLine } from './complete'

const ctx = {} as WorkerContext
/** PyMOL's habits: its argument rule, and files wherever a source declines. */
const dialect = {
  argRule: 'pymol',
  fileFallback: true,
  commands: () => COMMANDS,
  candidates: (...args: unknown[]) => candidates(...args),
} as unknown as ConsoleDialect
const cc = { sceneId: 1, viewId: 2, cwd: '/nowhere-that-exists', dialect }

function run(line: string) {
  return completeLine(ctx, line, cc)
}

/** The text of every printed line, joined. */
function printed(messages: { text: string }[]): string {
  return messages.map((m) => m.text).join('\n')
}

describe('command completion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('completes a unique command and adds the space after it', () => {
    expect(run('bg').replacement).toBe('bg_color ')
  })

  it('lists the longer names an exact command shares a prefix with', () => {
    // PyMOL searches prefixes even on an exact hit, so `set` reports
    // `set_name` rather than completing to itself.
    const out = run('set')
    expect(out.replacement).toBeNull()
    expect(printed(out.messages)).toContain('set')
    expect(printed(out.messages)).toContain('set_name')
  })

  it('accepts an underscore abbreviation', () => {
    expect(run('s_n').replacement).toBe('set_name ')
  })

  it('says so when nothing matches', () => {
    const out = run('zzz')
    expect(out.replacement).toBeNull()
    expect(printed(out.messages)).toContain('no matching commands.')
  })
})

describe('argument completion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rewrites the abbreviation to the full name and adds the separator', () => {
    candidates.mockReturnValue(['bgcolor'])
    expect(run('set bgc').replacement).toBe('set bgcolor, ')
  })

  it('extends to the common prefix only, with no separator', () => {
    candidates.mockReturnValue(['aoEnabled', 'aoEnergy'])
    const out = run('set ao')
    // The line grows as far as the candidates agree -- but they are several,
    // so no `, ` is added and the user is left mid-word.
    expect(out.replacement).toBe('set aoEn')
    expect(printed(out.messages)).toContain('matching setting:')
  })

  it('leaves the line alone when the common prefix adds nothing', () => {
    candidates.mockReturnValue(['aoRadius', 'aoSteps'])
    const out = run('set ao')
    expect(out.replacement).toBeNull()
    expect(printed(out.messages)).toContain('matching setting:')
  })

  it('completes an argument that is already a candidate exactly', () => {
    // Unlike a command word, an argument that names a candidate exactly is
    // taken as that candidate -- PyMOL passes mode=False here -- so `ao`
    // completes even though `aoRadius` also starts that way.
    candidates.mockReturnValue(['ao', 'aoRadius'])
    expect(run('set ao').replacement).toBe('set ao, ')
  })

  it('normalises the spacing after the last comma', () => {
    candidates.mockReturnValue(['always'])
    expect(run('set bgcolor,alw').replacement).toBe('set bgcolor, always, ')
  })

  it('completes a name with a space in it, and otherwise the last word', () => {
    // The whole argument is tried first, so "my sc" reaches "my scene"; an
    // expression whose whole text matches nothing still completes its last
    // word, as PyMOL does.
    candidates.mockReturnValue(['my scene', 'yellow'])
    expect(run('set bgcolor, my sc').replacement).toBe('set bgcolor, my scene, ')
    expect(run('set bgcolor, red or yel').replacement).toBe('set bgcolor, red or yellow, ')
  })

  it('does not count a comma inside brackets as an argument boundary', () => {
    candidates.mockReturnValue(['only-for-argument-0'])
    // Were the bracketed comma counted, this would look like argument 1 and
    // ask the value source instead.
    run('set [1,0,0]x')
    expect(candidates.mock.calls[0][0]).toBe('settings')
  })

  it('asks the value source once past the first comma', () => {
    candidates.mockReturnValue(['on', 'off'])
    run('set aoEnabled, o')
    expect(candidates.mock.calls[0][0]).toBe('settingValue')
    // The value source is told what came before, by parameter name, which is
    // how it knows which property's values to list.
    expect(candidates.mock.calls[0][2].bound).toEqual({ a: 'aoEnabled' })
  })

  it('completes a name=value argument from the source of the parameter it names', () => {
    candidates.mockReturnValue(['buildit=true', 'buildit=false'])
    // In the first position, but `b=` names the second parameter.
    const out = run('set b=buildit=t')
    expect(candidates.mock.calls[0][0]).toBe('settingValue')
    expect(out.replacement).toBe('set b=buildit=true, ')
  })

  it('falls back to files when the source declines', () => {
    candidates.mockReturnValue(null)
    const out = run('set aoRadius, 0')
    expect(printed(out.messages)).toContain('no matching files')
  })

  it('falls back to files for a command with no entry at that position', () => {
    const out = run('load /nowhere-that-exists/x')
    expect(candidates).not.toHaveBeenCalled()
    expect(printed(out.messages)).toContain('no matching files')
  })

  it('falls back to files when the command word is ambiguous', () => {
    // `se` is both `set` and `set_name`, so PyMOL cannot pick an entry and
    // globs instead.
    const out = run('se /nowhere-that-exists/x')
    expect(candidates).not.toHaveBeenCalled()
    expect(printed(out.messages)).toContain('no matching files.')
  })
})

// --- The native dialect's completion: every kind of thing an argument can be ---

const LOAD = {
  name: 'load',
  params: [{ name: 'path' }, { name: 'rendererType', default: '' }, { name: 'selection', default: '' }],
  mode: 'strict',
  mutates: true,
  summary: 'stub',
  completions: [
    { source: 'files', description: 'file', open: true },
    { source: 'rendererTypes', description: 'renderer type' },
    { source: 'selections', description: 'selection', open: true },
  ],
  run: () => ({ ok: true }),
}
const nativeSources = vi.fn((id: string, _ctx?: unknown, _sc?: unknown) =>
  id === 'rendererTypes' ? ['cartoon', 'cpk', 'simple'] : id === 'selections' ? ['protein', 'ligand'] : [],
)
const native = {
  argRule: 'python',
  fileFallback: false,
  commands: () => [LOAD],
  candidates: (id: string, c: unknown, sc: unknown) => nativeSources(id, c, sc),
} as unknown as ConsoleDialect
const runNative = (line: string) => completeLine(ctx, line, { ...cc, dialect: native })

describe('native argument completion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offers the values of the next parameter and the names of the ones not given', () => {
    const out = runNative('load f.pdb, ')
    expect(printed(out.messages)).toMatch(/matching renderer type:[\s\S]*cartoon[\s\S]*matching argument:[\s\S]*rendererType=[\s\S]*selection=/)
    expect(printed(out.messages)).not.toContain('path=')
    // A name completes to `name=`, with nothing after it; a value to `, ` while parameters remain.
    expect(runNative('load f.pdb, sel').replacement).toBe('load f.pdb, selection=')
    expect(runNative('load f.pdb, car').replacement).toBe('load f.pdb, cartoon, ')
  })

  it('completes the value of a named parameter, and gives its source the arguments by name', () => {
    expect(runNative('load path=f.pdb, rendererType=cp').replacement).toBe('load path=f.pdb, rendererType=cpk, ')
    expect(nativeSources.mock.calls.at(-1)?.[2]).toMatchObject({ bound: { path: 'f.pdb' } })
    // After a named argument only names may follow (a Python call's rule).
    const out = runNative('load path=f.pdb, ')
    expect(printed(out.messages)).not.toContain('matching renderer type')
    expect(printed(out.messages)).toContain('rendererType=')
  })

  it('reads a bracket as execution does, and adds nothing after the last parameter or an open one', () => {
    expect(runNative('load f.pdb, cartoon, (prot').replacement).toBe('load f.pdb, cartoon, (protein')
    expect(runNative('load f.pdb, cartoon, (protein, lig').replacement).toBe('load f.pdb, cartoon, (protein, ligand')
  })

  it('does not fall back to files where a parameter offers nothing', () => {
    nativeSources.mockReturnValueOnce([])
    const out = runNative('load f.pdb, zz')
    expect(printed(out.messages)).toContain('no matching renderer type or argument.')
    expect(printed(out.messages)).not.toContain('files')
  })
})
