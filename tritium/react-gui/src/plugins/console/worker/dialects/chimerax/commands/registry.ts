/**
 * @file plugins/console/worker/dialects/chimerax/commands/registry.ts
 * @description The ChX console's commands, in ChimeraX's registration order.
 *
 * The order matters: a command word is resolved to the first command it is
 * a prefix of (`col` is `color`, `c` is `cartoon`), as ChimeraX resolves it
 * against `std_commands/bundle_info.xml`'s order. `help` lists them by name.
 */

import type { ChxCommand } from '../cli/command'
import { COLOR_COMMANDS } from './colorCommands'
import { DISPLAY_COMMANDS } from './displayCommands'
import { FILE_COMMANDS } from './fileCommands'
import { MISC_COMMANDS, setCommandList } from './miscCommands'

/** Every command, in ChimeraX's registration order. */
export const CHX_COMMANDS: readonly ChxCommand[] = [
  DISPLAY_COMMANDS.cartoon,
  DISPLAY_COMMANDS.cartoonHide,
  FILE_COMMANDS.close,
  COLOR_COMMANDS.color,
  FILE_COMMANDS.delete,
  DISPLAY_COMMANDS.hide,
  FILE_COMMANDS.open,
  DISPLAY_COMMANDS.show,
  DISPLAY_COMMANDS.style,
  MISC_COMMANDS.undo,
  MISC_COMMANDS.redo,
  MISC_COMMANDS.usage,
  MISC_COMMANDS.view,
  MISC_COMMANDS.help,
]

setCommandList(() => CHX_COMMANDS)
