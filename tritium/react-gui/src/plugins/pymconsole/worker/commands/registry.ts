/**
 * @file plugins/pymconsole/worker/commands/registry.ts
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
import { OBJECT_COMMANDS } from './objectCommands'
import { SETTING_COMMANDS } from './settingCommands'
import { VIEW_COMMANDS } from './viewCommands'
import { usageLine } from '../parser/bindArgs'
import { lookupCommand } from '../parser/commandLookup'
import type { PymCommand } from './types'

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
      cc.print('Available commands:')
      for (const c of PYM_COMMANDS) {
        cc.print(`  ${c.name.padEnd(12)} ${c.summary}`)
      }
      cc.print('')
      cc.print('Type "help <command>" or "<command> ?" for usage.')
      cc.print('')
      // The one difference that changes what a command means rather than
      // whether it works, so it is said before the user meets it.
      cc.print('A selection made with "select" is a named expression, not a')
      cc.print('fixed set of atoms: it is re-evaluated against each molecule')
      cc.print('every time it is used, so loading more atoms can change what')
      cc.print('it matches.')
      return { ok: true }
    }
    const found = lookupCommand(topic, commandNames())
    if (found.kind === 'none') return { ok: false, error: `Error: unknown command: "${topic}"` }
    if (found.kind === 'ambiguous') {
      return { ok: false, error: `Error: ambiguous command: ${found.candidates.join(', ')}` }
    }
    const cmd = findCommand(found.name)
    if (!cmd) return { ok: false, error: `Error: unknown command: "${topic}"` }
    cc.print(usageLine(cmd.name, cmd.params))
    cc.print(cmd.summary)
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
