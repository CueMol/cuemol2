/**
 * @file plugins/console/worker/dialects/pymol/commands/registry.ts
 * @description Every command the console knows, and `help`.
 *
 * `help` lives here rather than with the other commands because it is the one
 * that reads the catalogue, and having it here keeps the catalogue from
 * having to be importable from a command module (which would be a cycle).
 */

import { FILE_COMMANDS } from './fileCommands'
import { MAP_COMMANDS } from './mapCommands'
import { MEASURE_COMMANDS } from './measureCommands'
import { REP_COMMANDS } from './repCommands'
import { SELECT_COMMANDS } from './selectCommands'
import { MISC_COMMANDS } from './miscCommands'
import { RAY_COMMANDS } from './rayCommands'
import { OBJECT_COMMANDS } from './objectCommands'
import { SETTING_COMMANDS } from './settingCommands'
import { VIEW_COMMANDS } from './viewCommands'
import { SAVE_COMMANDS } from './saveCommands'
import { COLOR_COMMANDS } from './colorCommands'
import { FIT_COMMANDS } from './fitCommands'
import { MOVIE_COMMANDS } from './movieCommands'
import { LABEL_COMMANDS } from './labelCommands'
import { usageLine } from '@plugins/console/worker/parser/bindArgs'
import { lookupCommand } from '@plugins/console/worker/parser/commandLookup'
import { commandHelp, commandTable } from '@plugins/console/worker/help/helpMarkdown'
import type { PymCommand } from './types'

/** What the PyMOL dialect's `help` says after the command table. */
const PYMOL_OVERVIEW = `Type \`help <command>\` or \`<command> ?\` for its arguments.

> A selection made with \`select\` is a **named expression**, not a fixed set of atoms:
> it is evaluated again against each molecule every time it is used, so loading more
> atoms can change what it matches.`

const help: PymCommand = {
  name: 'help',
  params: [{ name: 'command', default: 'commands' }],
  mode: 'strict',
  mutates: false,
  summary: 'List the commands, or explain one.',
  completions: [{ source: 'commands', description: 'command', suffix: '' }],
  run(_ctx, args, cc) {
    const topic = args.command.trim()
    if (topic === '' || topic === 'commands') {
      // The note on selections is the one difference that changes what a
      // command means rather than whether it works, so it is said up front.
      cc.printMarkdown(['# PyMOL commands', commandTable('Available commands', PYM_COMMANDS), PYMOL_OVERVIEW].join('\n\n'))
      return { ok: true }
    }
    const found = lookupCommand(topic, commandNames())
    if (found.kind === 'none') return { ok: false, error: `Error: unknown command: "${topic}"` }
    if (found.kind === 'ambiguous') {
      return { ok: false, error: `Error: ambiguous command: ${found.candidates.join(', ')}` }
    }
    const cmd = findCommand(found.name)
    if (!cmd) return { ok: false, error: `Error: unknown command: "${topic}"` }
    cc.printMarkdown(
      commandHelp({
        name: cmd.name,
        usage: usageLine(cmd.name, cmd.params).replace(/^Usage: /, ''),
        body: cmd.summary,
        args: cmd.params.map((p) => ({ name: p.name, default: p.default === undefined ? 'required' : p.default === '' ? 'optional' : p.default })),
      }),
    )
    return { ok: true }
  },
}

/**
 * The catalogue, sorted by name.
 *
 * Sorted so `help` reads in a predictable order; nothing else depends on it.
 */
export const PYM_COMMANDS: readonly PymCommand[] = [
  ...FILE_COMMANDS,
  ...OBJECT_COMMANDS,
  ...SELECT_COMMANDS,
  ...REP_COMMANDS,
  ...MAP_COMMANDS,
  ...MEASURE_COMMANDS,
  ...VIEW_COMMANDS,
  ...SETTING_COMMANDS,
  ...MISC_COMMANDS,
  ...RAY_COMMANDS,
  ...SAVE_COMMANDS,
  ...COLOR_COMMANDS,
  ...FIT_COMMANDS,
  ...MOVIE_COMMANDS,
  ...LABEL_COMMANDS,
  help,
].sort((a, b) => a.name.localeCompare(b.name))

/** Every command name. */
export function commandNames(): string[] {
  return PYM_COMMANDS.map((c) => c.name)
}

/** The command with this exact name. */
export function findCommand(name: string): PymCommand | undefined {
  return PYM_COMMANDS.find((c) => c.name === name)
}
