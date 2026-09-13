/**
 * @file plugins/pymconsole/worker/commands/registry.ts
 * @description Every command the console knows, and `help`.
 *
 * `help` lives here rather than with the other commands because it is the one
 * that reads the catalogue, and having it here keeps the catalogue from
 * having to be importable from a command module (which would be a cycle).
 */

import { FILE_COMMANDS } from './fileCommands'
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
