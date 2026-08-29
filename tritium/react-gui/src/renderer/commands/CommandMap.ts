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

import type { FileOpenedData } from '@shared/types/fileEvents'
import type { ChangeRendSelKind, RendColoringId, SelectMolKind } from '@shared/types/sceneCtxMenu'
import { CmdId } from './ids'

export interface CommandMap {
  // Scene
  [CmdId.SceneNew]:            { args: void;            result: void }
  [CmdId.OpenObjByPath]:       { args: FileOpenedData;  result: void }
  [CmdId.OpenSceneByPath]:     { args: string;          result: void }

  // Dialogs
  [CmdId.UiOpenObjDialog]:     { args: void;            result: void }
  [CmdId.UiOpenTrajDialog]:    { args: void;            result: void }
  [CmdId.UiOpenSceneDialog]:   { args: void;            result: void }
  [CmdId.UiAboutDialog]:       { args: void;            result: void }
  [CmdId.UiGetPdbDialog]:      { args: void;            result: void }
  [CmdId.UiChangeChainIdDialog]: { args: void;          result: void }
  [CmdId.UiDeleteMolDialog]:   { args: void;            result: void }
  [CmdId.UiChangeResidueIndexDialog]: { args: void;     result: void }
  [CmdId.UiMergeMolDialog]:    { args: void;            result: void }
  [CmdId.UiMakeMolSurfDialog]: { args: void;            result: void }
  [CmdId.UiCalcApbsPotDialog]: { args: void;            result: void }
  [CmdId.UiInteractionAnalysisDialog]: { args: void;    result: void }
  [CmdId.UiCutSurfByPlaneDialog]: { args: void;         result: void }
  [CmdId.UiReassignProt2ndryDialog]: { args: void;      result: void }
  [CmdId.UiMolSuperpose]:      { args: void;            result: void }
  [CmdId.UiMorphAnimDialog]:   { args: void;            result: void }

  // Tabs
  [CmdId.TabNew]:              { args: void;            result: void }
  [CmdId.TabClose]:            { args: string;          result: void }
  [CmdId.TabCloseActive]:      { args: void;            result: void }

  // File
  [CmdId.FileSave]:            { args: void;            result: boolean }
  [CmdId.FileSaveAs]:          { args: void;            result: boolean }
  // The scene tree right-clicks a specific object; the File menu has none
  // and resolves one from the active scene.
  [CmdId.ObjectSaveAs]:        { args: { objId?: number } | void; result: void }
  [CmdId.SaveCurrentView]:     { args: void;            result: void }
  [CmdId.ExportPng]:           { args: void;            result: void }
  [CmdId.ExportUmbreon]:       { args: void;            result: void }
  [CmdId.ExportPov]:           { args: void;            result: void }
  [CmdId.ExportStl]:           { args: void;            result: void }
  [CmdId.ExportMqo]:           { args: void;            result: void }
  [CmdId.SceneReload]:         { args: void;            result: void }

  // Edit
  [CmdId.Undo]:                { args: void;            result: void }
  [CmdId.Redo]:                { args: void;            result: void }
  [CmdId.ClearUndo]:           { args: void;            result: void }
  [CmdId.EditSelectAll]:       { args: void;            result: void }
  [CmdId.EditCut]:             { args: void;            result: void }
  [CmdId.EditCopy]:            { args: void;            result: void }
  [CmdId.EditPaste]:           { args: void;            result: void }
  [CmdId.EditUndoFocused]:     { args: void;            result: void }
  [CmdId.EditRedoFocused]:     { args: void;            result: void }

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
  [CmdId.SceneColorProof]:     { args: void;            result: void }
  [CmdId.SceneProperties]:     { args: void;            result: void }

  // Rendering
  [CmdId.UiRenderWindow]:      { args: void;            result: void }
  [CmdId.UiRenderWindowImage]: { args: void;            result: void }
  [CmdId.UiRenderWindowMovie]: { args: void;            result: void }

  // Window switching
  [CmdId.WindowFocusMain]:     { args: void;            result: void }

  // App settings
  [CmdId.UiSettingsTab]:       { args: void;            result: void }
  [CmdId.RecentClear]:         { args: void;            result: void }

  // Scene tree.
  //
  // The node ops carry the ids they act on, so the context menu, the tree
  // toolbar and the keyboard all reach the same handler with their own
  // resolved target.
  [CmdId.SceneNodeSetVisible]:  { args: { ids: string[]; visible?: boolean }; result: void }
  [CmdId.SceneNodeDelete]:      { args: { ids: string[] };       result: void }
  // Reports whether anything reached the clipboard: Cut deletes only then.
  [CmdId.SceneNodeCopy]:        { args: { ids: string[] };       result: boolean }
  [CmdId.SceneNodePaste]:       { args: { targetId: string };    result: void }
  [CmdId.SceneNodeRenameBegin]: { args: { id: string };          result: void }
  [CmdId.SceneNodeProperty]:    { args: { id: string };          result: void }
  [CmdId.SceneNodeSelectMol]:   { args: { id: string; selectKind: SelectMolKind }; result: void }

  // Renderers and objects.
  [CmdId.RendererNew]:          { args: { sourceNodeId: string }; result: void }
  [CmdId.RendererNewGroup]:     { args: { objId: string };       result: void }
  [CmdId.RendererSetColoring]:  { args: { id: string; coloringId: RendColoringId }; result: void }
  [CmdId.RendererPaint]:        { args: { id: string; colorValue: string }; result: void }
  [CmdId.RendererApplyStyle]:   { args: { id: string; styleName: string; pattern: string; flags: string }; result: void }
  [CmdId.RendererSetSelection]: { args: { id: string; selKind: ChangeRendSelKind }; result: void }
  [CmdId.RendererGenSurfObj]:   { args: { id: string };          result: void }
  [CmdId.RendererChangeType]:   { args: { id: string; typeName: string }; result: void }
  [CmdId.RendererEditStyle]:    { args: { id: string };          result: void }
  [CmdId.RendererCreateStyle]:  { args: { id: string };          result: void }
  [CmdId.RendererEditIntrList]: { args: { id: string; rendName: string }; result: void }
  [CmdId.ObjectRegenSurface]:   { args: { objId: string };       result: void }

  // Style sets. `scopeId` is the style set's scope, carried from the row.
  [CmdId.StyleNew]:             { args: void;                    result: void }
  [CmdId.StyleEdit]:            { args: StyleSetRef;             result: void }
  [CmdId.StyleToggleReadOnly]:  { args: { id: string; scopeId: number }; result: void }
  [CmdId.StyleLoadFromFile]:    { args: void;                    result: void }
  [CmdId.StyleReload]:          { args: void;                    result: void }
  [CmdId.StyleSave]:            { args: StyleSetRef;             result: void }
  [CmdId.StyleSaveAs]:          { args: StyleSetRef;             result: void }

  // Cameras, addressed by name (a registered camera has no uid).
  [CmdId.CameraNew]:            { args: void;                    result: void }
  [CmdId.CameraLoadFromFile]:   { args: void;                    result: void }
  [CmdId.CameraReload]:         { args: { name: string };        result: void }
  [CmdId.CameraSave]:           { args: { name: string };        result: void }
  [CmdId.CameraSaveAs]:         { args: { name: string };        result: void }
  [CmdId.CameraSaveFromView]:   { args: { name: string; withVisFlags: boolean }; result: void }
  [CmdId.CameraApplyToView]:    { args: { name: string; withVisFlags: boolean }; result: void }
  [CmdId.CameraEditVisFlags]:   { args: { name: string };        result: void }
  [CmdId.CameraClearVisFlags]:  { args: { name: string };        result: void }
}

/** A style-set row: its uid, the scope it lives in, and its display name. */
export interface StyleSetRef {
  id: string
  scopeId: number
  name: string
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
