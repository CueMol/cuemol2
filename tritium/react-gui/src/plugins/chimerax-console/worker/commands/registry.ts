/**
 * @file plugins/chimerax-console/worker/commands/registry.ts
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
import { VIEW_COMMANDS } from './viewCommands'
import { ALIAS_COMMANDS, setAliasCommandList } from './aliasCommands'
import { SELECT_COMMANDS } from './selectCommands'
import { REPR_COMMANDS } from './reprCommands'
import { ANALYSIS_COMMANDS } from './analysisCommands'

/** Every command, in ChimeraX's registration order. */
export const CHX_COMMANDS: readonly ChxCommand[] = [
  ALIAS_COMMANDS.alias,
  ALIAS_COMMANDS.aliasList,
  ALIAS_COMMANDS.aliasDelete,
  ALIAS_COMMANDS.unalias,
  ANALYSIS_COMMANDS.align,
  DISPLAY_COMMANDS.cartoon,
  DISPLAY_COMMANDS.cartoonHide,
  FILE_COMMANDS.close,
  VIEW_COMMANDS.cofr,
  COLOR_COMMANDS.color,
  FILE_COMMANDS.delete,
  VIEW_COMMANDS.graphicsSilhouettes,
  DISPLAY_COMMANDS.hide,
  VIEW_COMMANDS.move,
  FILE_COMMANDS.open,
  COLOR_COMMANDS.rainbow,
  SELECT_COMMANDS.select,
  SELECT_COMMANDS.selectAdd,
  SELECT_COMMANDS.selectSubtract,
  SELECT_COMMANDS.selectIntersect,
  SELECT_COMMANDS.selectClear,
  SELECT_COMMANDS.unselect,
  VIEW_COMMANDS.set,
  DISPLAY_COMMANDS.show,
  DISPLAY_COMMANDS.style,
  REPR_COMMANDS.transparency,
  VIEW_COMMANDS.turn,
  MISC_COMMANDS.undo,
  MISC_COMMANDS.redo,
  MISC_COMMANDS.usage,
  MISC_COMMANDS.view,
  VIEW_COMMANDS.viewList,
  VIEW_COMMANDS.viewDelete,
  VIEW_COMMANDS.viewName,
  VIEW_COMMANDS.viewMatrix,
  VIEW_COMMANDS.zoom,
  // Other bundles' commands, after std_commands: label, surface,
  // matchmaker, distance, list_info, save_command, basic_actions.
  REPR_COMMANDS.label,
  REPR_COMMANDS.labelDelete,
  REPR_COMMANDS.unlabel,
  REPR_COMMANDS.surface,
  REPR_COMMANDS.surfaceHidePatches,
  REPR_COMMANDS.surfaceClose,
  REPR_COMMANDS.unsurface,
  ANALYSIS_COMMANDS.matchmaker,
  ANALYSIS_COMMANDS.mmaker,
  ANALYSIS_COMMANDS.distance,
  ANALYSIS_COMMANDS.distanceDelete,
  ANALYSIS_COMMANDS.undistance,
  SELECT_COMMANDS.info,
  SELECT_COMMANDS.infoModels,
  SELECT_COMMANDS.infoChains,
  SELECT_COMMANDS.infoResidues,
  SELECT_COMMANDS.infoAtoms,
  FILE_COMMANDS.save,
  SELECT_COMMANDS.name,
  SELECT_COMMANDS.nameFrozen,
  SELECT_COMMANDS.nameDelete,
  SELECT_COMMANDS.nameList,
  MISC_COMMANDS.help,
]

setCommandList(() => CHX_COMMANDS)
setAliasCommandList(() => CHX_COMMANDS)
