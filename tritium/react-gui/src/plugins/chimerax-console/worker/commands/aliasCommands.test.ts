/**
 * @file plugins/chimerax-console/worker/commands/aliasCommands.test.ts
 * @description Defining and calling a ChimeraX alias.
 *
 * The cases pin what goes wrong quietly: a definition cut at its `;` (the
 * second command runs at once and the alias keeps only the first), an alias
 * defined in a script that the next line cannot call yet, an alias that
 * expands itself forever, and an alias that runs a command which must stay
 * outside the transaction (`undo`) inside it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { CmdContext } from '@plugins/console/worker/dialect-api'

vi.mock('../names', () => ({ selectionNames: () => new Set<string>(), namedSelections: () => [] }))

import { chxCommand } from '../cli/command'
import { RestOfLine } from '../cli/argTypes'
import { bindLine, splitLines } from '../cli/syntax'
import { ALIAS_COMMANDS, clearAliases, expandAlias, resolveChx, setAliasCommandList } from './aliasCommands'

/** A command that records the words it ran with. */
const ran: string[] = []
const echo = chxCommand({
  words: ['echo'],
  args: [{ name: 'text', type: RestOfLine, role: 'optional' }],
  mutates: false,
  summary: '',
  run: (_ctx, args) => {
    ran.push(args.text)
    return { ok: true }
  },
})
const undo = chxCommand({ words: ['undo'], args: [], undoStack: 'undo', mutates: false, summary: '', run: () => ({ ok: true }) })
const commands = [ALIAS_COMMANDS.alias, ALIAS_COMMANDS.aliasList, ALIAS_COMMANDS.aliasDelete, ALIAS_COMMANDS.unalias, echo, undo]
setAliasCommandList(() => commands)

const ctx = {} as WorkerContext
const cc = { sceneId: 1, print: vi.fn(), warn: vi.fn() } as unknown as CmdContext

/** Run a script line by line, resolving each just before it runs, as the runtime does. */
async function runScript(text: string): Promise<{ ok: boolean; error?: string }> {
  for (const line of splitLines(text)) {
    const r = resolveChx(line.text, commands)
    if ('error' in r) return { ok: false, error: r.error }
    const bound = bindLine(r.spec, line.text)
    if (bound.kind !== 'args') return { ok: false, error: 'bind' }
    const out = await r.spec.run(ctx, bound.args, cc)
    if (!out.ok) return out
  }
  return { ok: true }
}

beforeEach(() => {
  clearAliases()
  ran.length = 0
})

describe('alias', () => {
  it('keeps the whole line as the definition, and runs it when called on a later line', async () => {
    expect(await runScript('alias two echo a; echo $1\ntwo b')).toEqual({ ok: true })
    // Nothing ran at the definition; the call ran both commands, $1 filled in.
    expect(ran).toEqual(['a', 'b'])
  })

  it('expands $1-$9 and $*', () => {
    expect(expandAlias('show $1 atoms; color $1 $2; label $*', ':CYS red')).toBe('show :CYS atoms; color :CYS red; label :CYS red')
  })

  it('does not expand itself again, and refuses an undo inside it before anything runs', async () => {
    expect((await runScript('alias loop loop\nloop')).ok).toBe(false)
    const out = await runScript('alias u echo x; undo\nu')
    expect(out.error).toMatch(/undo cannot run inside an alias/)
    expect(ran).toEqual([])
  })
})
