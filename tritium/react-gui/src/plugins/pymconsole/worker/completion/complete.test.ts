/**
 * @file plugins/pymconsole/worker/completion/complete.test.ts
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
import type { PymCommand } from '../commands/types'

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

vi.mock('../commands/registry', () => ({
  PYM_COMMANDS: COMMANDS,
  commandNames: () => COMMANDS.map((c) => c.name),
  findCommand: (name: string) => COMMANDS.find((c) => c.name === name),
}))

vi.mock('./sources', () => ({
  candidatesFor: (...args: unknown[]) => candidates(...args),
}))

import { completeLine } from './complete'

const ctx = {} as WorkerContext
const cc = { sceneId: 1, viewId: 2, cwd: '/nowhere-that-exists' }

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
    // The value source is told what came before, which is how it knows which
    // property's values to list.
    expect(candidates.mock.calls[0][2].argsSoFar).toEqual(['aoEnabled'])
  })

  it('falls back to files when the source declines', () => {
    candidates.mockReturnValue(null)
    const out = run('set aoRadius, 0')
    expect(printed(out.messages)).toContain('no matching files.')
  })

  it('falls back to files for a command with no entry at that position', () => {
    const out = run('load /nowhere-that-exists/x')
    expect(candidates).not.toHaveBeenCalled()
    expect(printed(out.messages)).toContain('no matching files.')
  })

  it('falls back to files when the command word is ambiguous', () => {
    // `se` is both `set` and `set_name`, so PyMOL cannot pick an entry and
    // globs instead.
    const out = run('se /nowhere-that-exists/x')
    expect(candidates).not.toHaveBeenCalled()
    expect(printed(out.messages)).toContain('no matching files.')
  })
})
