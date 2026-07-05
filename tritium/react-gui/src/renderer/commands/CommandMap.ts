/**
 * Typed contract that pairs each `CmdId` with its dispatch args and handler
 * result. `useRegisterCommand` and `useCommands().dispatch` are generic over
 * this map so that mismatched args (e.g. forgetting the tab id when
 * dispatching `CmdId.TabClose`) become compile errors.
 *
 * Adding a CmdId: add the constant in `ids.ts` AND a row here. The
 * `_CommandMapMatchesCmdId` assertion below catches `ids.ts` entries that
 * lack a CommandMap row.
 */

import type { FileOpenedData } from '../../shared/ipcTypes'
import { CmdId } from './ids'

export interface CommandMap {
  // Scene
  [CmdId.SceneNew]:            { args: void;            result: void }
  [CmdId.OpenObjByPath]:       { args: FileOpenedData;  result: void }
  [CmdId.OpenSceneByPath]:     { args: string;          result: void }

  // Dialogs
  [CmdId.UiOpenObjDialog]:     { args: void;            result: void }
  [CmdId.UiOpenSceneDialog]:   { args: void;            result: void }
  [CmdId.UiAboutDialog]:       { args: void;            result: void }
  [CmdId.UiGetPdbDialog]:      { args: void;            result: void }
  [CmdId.UiChangeChainIdDialog]: { args: void;          result: void }
  [CmdId.UiDeleteMolDialog]:   { args: void;            result: void }
  [CmdId.UiChangeResidueIndexDialog]: { args: void;     result: void }
  [CmdId.UiMergeMolDialog]:    { args: void;            result: void }
  [CmdId.UiMakeMolSurfDialog]: { args: void;            result: void }
  [CmdId.UiInteractionAnalysisDialog]: { args: void;    result: void }
  [CmdId.UiCutSurfByPlaneDialog]: { args: void;         result: void }
  [CmdId.UiReassignProt2ndryDialog]: { args: void;      result: void }
  [CmdId.UiMolSuperpose]:      { args: void;            result: void }

  // Tabs
  [CmdId.TabNew]:              { args: void;            result: void }
  [CmdId.TabClose]:            { args: string;          result: void }

  // File
  [CmdId.FileSave]:            { args: void;            result: boolean }
  [CmdId.FileSaveAs]:          { args: void;            result: boolean }
  [CmdId.ObjectSaveAs]:        { args: void;            result: void }
  [CmdId.SaveCurrentView]:     { args: void;            result: void }
  [CmdId.ExportImage]:         { args: void;            result: void }
  [CmdId.SceneReload]:         { args: void;            result: void }

  // Edit
  [CmdId.Undo]:                { args: void;            result: void }
  [CmdId.Redo]:                { args: void;            result: void }

  // View
  [CmdId.ViewPerspective]:     { args: void;            result: void }
  [CmdId.ViewOrthographic]:    { args: void;            result: void }
  [CmdId.ViewCenterMarkCross]: { args: void;            result: void }
  [CmdId.ViewCenterMarkAxis]:  { args: void;            result: void }
  [CmdId.ViewCenterMarkNone]:  { args: void;            result: void }
  [CmdId.UiViewProperty]:      { args: void;            result: void }

  // Scene background
  [CmdId.SceneBgWhite]:        { args: void;            result: void }
  [CmdId.SceneBgBlack]:        { args: void;            result: void }

  // Rendering
  [CmdId.UiRenderWindow]:      { args: void;            result: void }
}

export type CommandKey = keyof CommandMap
export type CommandArgs<K extends CommandKey> = CommandMap[K]['args']
export type CommandResult<K extends CommandKey> = CommandMap[K]['result']

/** Variadic argument list for `dispatch`: void-args commands take no payload. */
export type CommandDispatchArgs<K extends CommandKey> = CommandArgs<K> extends void
  ? []
  : [CommandArgs<K>]

/** Handler signature for `register` / `useRegisterCommand`. */
export type CommandHandler<K extends CommandKey> = (
  args: CommandArgs<K>,
) => CommandResult<K> | Promise<CommandResult<K>>

// ------------------------------------------------------------
// Type-level assertion: every CmdId has a CommandMap row.
// If a new CmdId is added without a row here, `_CommandMapMatchesCmdId`
// becomes `false`, producing a compile error on the line below.
// ------------------------------------------------------------

type _ExactKeys<A extends string, B extends string> = [A, B] extends [B, A] ? true : false
type _CommandMapMatchesCmdId = _ExactKeys<CommandKey, CmdId>
const _commandMapMatchesCmdId: _CommandMapMatchesCmdId = true
void _commandMapMatchesCmdId
