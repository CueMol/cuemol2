/**
 * @file plugins/console/worker/dialects/chimerax/cli/command.ts
 * @description What a ChimeraX command declares: its words and its arguments by role.
 */

import type { ConsoleCommand } from '../../../runtime/types'
import type { ArgType } from './argTypes'

/**
 * One argument. `required` and `optional` are positional, in order (an
 * optional one may also be given as a keyword); `keyword` ones only by name.
 * The name is the keyword, in camelCase as ChimeraX writes it.
 */
export interface ChxArg {
  name: string
  type: ArgType
  role: 'required' | 'optional' | 'keyword'
  /** The value when it is not given; '' when absent means "not given". */
  default?: string
  /** Accepted so scripts run, but the console does not do it yet: a warning says so. */
  ignored?: boolean
}

/** A ChimeraX command. Its `name` is its words joined by spaces (`cartoon hide`). */
export interface ChxCommand extends ConsoleCommand {
  /** The words it is typed as. */
  words: readonly string[]
  args: readonly ChxArg[]
  /** The usage line's text after the command (cli.py `usage`). */
  usageText?: string
}

/** A ChimeraX command, from its words and arguments; `params` and `mode` follow from them. */
export function chxCommand(
  def: Omit<ChxCommand, 'name' | 'params' | 'mode'> & { name?: string },
): ChxCommand {
  return {
    ...def,
    name: def.words.join(' '),
    params: def.args.map((a) => ({ name: a.name, default: a.default ?? '' })),
    // The comma grammar's argument mode, unused here.
    mode: 'strict',
  }
}

/** Whether a command is a ChimeraX one (it declares its arguments by role). */
export function isChxCommand(c: ConsoleCommand): c is ChxCommand {
  return Array.isArray((c as ChxCommand).words) && Array.isArray((c as ChxCommand).args)
}
