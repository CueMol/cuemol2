/**
 * Typed contract for the renderer ↔ Web Worker boundary.
 *
 * Three categories of calls flow over the same wire (`postMessage` with
 * `[method, seqno, ...args]`) but have distinct dispatch semantics on the
 * worker side; we mirror that split with three maps:
 *
 *   - ServiceMap  → business-logic services registered via `register(name, fn)`.
 *                   Wire form: `invokeService(name, args)`. Worker side:
 *                   `fn(ctx, args[0])` (single-arg).
 *   - MethodMap   → infrastructure / hot-path methods declared in
 *                   `WorkerService._methods`. Wire form:
 *                   `invokeMethod(name, ...positional)`. Worker side:
 *                   `fn.apply(this, args)` (variadic).
 *   - RpcMap      → ObjProxy bridge handlers (createObj, getProp, …). Same
 *                   variadic dispatch as MethodMap, kept separate to
 *                   document the proxy intent.
 *
 * Adding a service / method / RPC: add an entry here, then implement on the
 * worker side. Type-checking flows from this file outward.
 */

import type { ObjTuple } from './ObjTuple'

import type { AppInfoResult } from '../server/services/appInfo.service'
import type { CreateNewSceneAndViewArgs, CreateNewSceneAndViewResult } from '../server/services/createNewSceneAndView.service'
import type { CreateViewInSceneArgs, CreateViewInSceneResult } from '../server/services/createViewInScene.service'
import type { GetCompatibleRendererNamesArgs } from '../server/services/getCompatibleRendererNames.service'
import type { GetOpenFiltersArgs } from '../server/services/getOpenFilters.service'
import type { GetSceneCloseInfoArgs, GetSceneCloseInfoResult } from '../server/services/getSceneCloseInfo.service'
import type { GetSelDefsArgs, GetSelDefsResult } from '../server/services/getSelDefs.service'
import type { LoadObjectArgs } from '../server/services/loadObject.service'
import type { LoadSceneArgs } from '../server/services/loadScene.service'
import type {
  StreamLoadFromUrlArgs,
  StreamLoadFromUrlResult,
  CancelStreamLoadArgs,
  CancelStreamLoadResult,
} from '../server/services/streamLoadFromUrl.service'
import type {
  StreamLoadDensityMapArgs,
  StreamLoadDensityMapResult,
} from '../server/services/streamLoadDensityMap.service'
import type {
  NaviCenterAtArgs,
  NaviCenterAtSymmArgs,
  NaviCtxAroundArgs,
  NaviCtxObjArgs,
  NaviCtxSelectArgs,
} from '../server/services/naviCtxtMenu.service'
import type {
  NaviClickAtomArgs, NaviClickAtomResult,
  NaviHitTestArgs, NaviHitTestResult,
  NaviResidSelArgs, NaviResidSelResult,
} from '../server/services/naviTool.service'
import type { ProposeNewTabNamesArgs, ProposeNewTabNamesResult } from '../server/services/proposeNewTabNames.service'
import type { ProposeUniqNameArgs, ProposeUniqNameResult } from '../server/services/proposeUniqName.service'
import type { RedoArgs } from '../server/services/redo.service'
import type {
  GetSceneSaveInfoArgs,
  GetSceneSaveInfoResult,
  SaveSceneArgs,
  SaveSceneResult,
} from '../server/services/saveScene.service'
import type {
  SceneBgColorArgs,
  SceneBgColorResult,
  SetSceneBgColorArgs,
  SceneColorProofingArgs,
  SceneColorProofingResult,
} from '../server/services/sceneBgColor.service'
import type {
  GetSceneTreeArgs,
  GetSceneTreeResult,
  SetNodeVisibleArgs,
  SetNodeVisibleResult,
} from '../server/services/sceneTree.service'
import type {
  FocusOnNodeArgs,
  FocusOnNodeResult,
  DeleteNodeArgs,
  DeleteNodeResult,
  GetNodeInfoArgs,
  GetNodeInfoResult,
  RenameNodeArgs,
  RenameNodeResult,
  SelectObjectMolArgs,
  SelectObjectMolResult,
} from '../server/services/sceneOps.service'
import type {
  CopyNodeArgs,
  CopyNodeResult,
  PasteNodeArgs,
  PasteNodeResult,
  GetClipboardKindArgs,
  GetClipboardKindResult,
} from '../server/services/sceneClipboard.service'
import type {
  SetRendererColoringArgs,
  SetRendererColoringResult,
  GetPaintColoringStylesArgs,
  GetPaintColoringStylesResult,
  PaintRendererSelectionArgs,
  PaintRendererSelectionResult,
  GetRendererPaintInfoArgs,
  GetRendererPaintInfoResult,
} from '../server/services/rendererColoring.service'
import type {
  GetRendererStyleEntriesArgs,
  GetRendererStyleEntriesResult,
  ApplyRendererStyleArgs,
  ApplyRendererStyleResult,
} from '../server/services/rendererStyle.service'
import type {
  SetRendererSelectionArgs,
  SetRendererSelectionResult,
} from '../server/services/setRendererSelection.service'
import type {
  GenerateRendererSurfObjArgs,
  GenerateRendererSurfObjResult,
} from '../server/services/generateRendererSurfObj.service'
import type {
  CreateRendererGroupArgs,
  CreateRendererGroupResult,
} from '../server/services/createRendererGroup.service'
import type { UndoArgs } from '../server/services/undo.service'
import type {
  ValidateSelectionArgs,
  ValidateSelectionResult,
} from '../server/services/validateSelection.service'
import type {
  ViewCenterMarkArgs,
  ViewCenterMarkResult,
  ViewProjectionArgs,
  ViewProjectionResult,
} from '../server/services/viewProjection.service'
import type { ElectronFileFilter } from '../../../shared/ipcTypes'
import type { WorkerContext } from '../server/types/WorkerContext'

// ────────────────────────────────────────────────────────────
// Serialized DOM events (worker side cannot read live DOM events)
// ────────────────────────────────────────────────────────────

/** Mouse event fields that inputApi forwards to the worker. */
export interface SerializedMouseEvent {
  clientX: number; clientY: number
  screenX: number; screenY: number
  offsetX: number; offsetY: number
  buttons: number; button: number
  ctrlKey: boolean; shiftKey: boolean
}

/** Wheel event fields that inputApi forwards to the worker. */
export interface SerializedWheelEvent {
  offsetX: number; offsetY: number
  screenX: number; screenY: number
  deltaX: number; deltaY: number
  ctrlKey: boolean; shiftKey: boolean; altKey: boolean
}

/** Synthetic gesture event built by inputApi (axisID + delta). */
export interface SerializedGestureEvent {
  offsetX: number; offsetY: number
  screenX: number; screenY: number
  ctrlKey: boolean; shiftKey: boolean; altKey: boolean
  axisID: number; delta: number
}

// ────────────────────────────────────────────────────────────
// ServiceMap (registered services — `_registered` table)
// ────────────────────────────────────────────────────────────

export interface ServiceMap {
  appInfo:                    { args: Record<string, never>;          result: AppInfoResult }
  createNewSceneAndView:      { args: CreateNewSceneAndViewArgs;       result: CreateNewSceneAndViewResult }
  createViewInScene:          { args: CreateViewInSceneArgs;           result: CreateViewInSceneResult }
  getCompatibleRendererNames: { args: GetCompatibleRendererNamesArgs;  result: string[] }
  getOpenFilters:             { args: GetOpenFiltersArgs;              result: ElectronFileFilter[] }
  getSceneCloseInfo:          { args: GetSceneCloseInfoArgs;           result: GetSceneCloseInfoResult }
  getSelDefs:                 { args: GetSelDefsArgs;                  result: GetSelDefsResult }
  loadObject:                 { args: LoadObjectArgs;                  result: { ok: boolean } }
  loadScene:                  { args: LoadSceneArgs;                   result: { ok: boolean } }
  streamLoadFromUrl:          { args: StreamLoadFromUrlArgs;           result: StreamLoadFromUrlResult }
  streamLoadDensityMap:       { args: StreamLoadDensityMapArgs;        result: StreamLoadDensityMapResult }
  cancelStreamLoad:           { args: CancelStreamLoadArgs;            result: CancelStreamLoadResult }
  proposeNewTabNames:         { args: ProposeNewTabNamesArgs;          result: ProposeNewTabNamesResult }
  proposeUniqName:            { args: ProposeUniqNameArgs;             result: ProposeUniqNameResult }
  redo:                       { args: RedoArgs;                        result: { ok: boolean } }
  undo:                       { args: UndoArgs;                        result: { ok: boolean } }
  getSceneSaveInfo:           { args: GetSceneSaveInfoArgs;            result: GetSceneSaveInfoResult }
  saveScene:                  { args: SaveSceneArgs;                   result: SaveSceneResult }
  validateSelection:          { args: ValidateSelectionArgs;           result: ValidateSelectionResult }
  getSceneBgColor:            { args: SceneBgColorArgs;                result: SceneBgColorResult }
  setSceneBgColor:            { args: SetSceneBgColorArgs;             result: SceneBgColorResult }
  getSceneColorProofing:      { args: SceneColorProofingArgs;          result: SceneColorProofingResult }
  toggleSceneColorProofing:   { args: SceneColorProofingArgs;          result: SceneColorProofingResult }
  getSceneTree:               { args: GetSceneTreeArgs;                result: GetSceneTreeResult }
  setNodeVisible:             { args: SetNodeVisibleArgs;              result: SetNodeVisibleResult }
  focusOnNode:                { args: FocusOnNodeArgs;                 result: FocusOnNodeResult }
  deleteNode:                 { args: DeleteNodeArgs;                  result: DeleteNodeResult }
  getNodeInfo:                { args: GetNodeInfoArgs;                 result: GetNodeInfoResult }
  renameNode:                 { args: RenameNodeArgs;                  result: RenameNodeResult }
  selectObjectMol:            { args: SelectObjectMolArgs;             result: SelectObjectMolResult }
  copyNode:                   { args: CopyNodeArgs;                    result: CopyNodeResult }
  pasteNode:                  { args: PasteNodeArgs;                   result: PasteNodeResult }
  getClipboardKind:           { args: GetClipboardKindArgs;            result: GetClipboardKindResult }
  setRendererColoring:        { args: SetRendererColoringArgs;         result: SetRendererColoringResult }
  getPaintColoringStyles:     { args: GetPaintColoringStylesArgs;      result: GetPaintColoringStylesResult }
  paintRendererSelection:     { args: PaintRendererSelectionArgs;      result: PaintRendererSelectionResult }
  getRendererPaintInfo:       { args: GetRendererPaintInfoArgs;        result: GetRendererPaintInfoResult }
  getRendererStyleEntries:    { args: GetRendererStyleEntriesArgs;     result: GetRendererStyleEntriesResult }
  applyRendererStyle:         { args: ApplyRendererStyleArgs;          result: ApplyRendererStyleResult }
  setRendererSelection:       { args: SetRendererSelectionArgs;        result: SetRendererSelectionResult }
  generateRendererSurfObj:    { args: GenerateRendererSurfObjArgs;     result: GenerateRendererSurfObjResult }
  createRendererGroup:        { args: CreateRendererGroupArgs;         result: CreateRendererGroupResult }
  getViewProjection:          { args: ViewProjectionArgs;              result: ViewProjectionResult }
  setViewProjection:          { args: ViewProjectionArgs;              result: ViewProjectionResult }
  getViewCenterMark:          { args: ViewCenterMarkArgs;              result: ViewCenterMarkResult }
  setViewCenterMark:          { args: ViewCenterMarkArgs;              result: ViewCenterMarkResult }
  naviHitTest:                { args: NaviHitTestArgs;                 result: NaviHitTestResult }
  naviClickAtom:              { args: NaviClickAtomArgs;               result: NaviClickAtomResult }
  naviResidSel:               { args: NaviResidSelArgs;                result: NaviResidSelResult }
  naviCenterAt:               { args: NaviCenterAtArgs;                result: { ok: boolean } }
  naviCenterAtSymm:           { args: NaviCenterAtSymmArgs;            result: { ok: boolean } }
  naviCtxSelect:              { args: NaviCtxSelectArgs;               result: { ok: boolean } }
  naviCtxAddSelect:           { args: NaviCtxSelectArgs;               result: { ok: boolean } }
  naviCtxUnselect:            { args: NaviCtxObjArgs;                  result: { ok: boolean } }
  naviCtxInvertSel:           { args: NaviCtxObjArgs;                  result: { ok: boolean } }
  naviCtxToggleSidechain:     { args: NaviCtxObjArgs;                  result: { ok: boolean } }
  naviCtxAround:              { args: NaviCtxAroundArgs;               result: { ok: boolean } }
}

export type ServiceKey = keyof ServiceMap
export type ServiceArgs<K extends ServiceKey> = ServiceMap[K]['args']
export type ServiceResult<K extends ServiceKey> = ServiceMap[K]['result']

/** Worker-side service implementation signature. */
export type ServiceFn<K extends ServiceKey> = (
  ctx: WorkerContext,
  args: ServiceArgs<K>,
) => ServiceResult<K> | Promise<ServiceResult<K>>

// ────────────────────────────────────────────────────────────
// MethodMap (infrastructure / hot-path — `_methods` table)
// ────────────────────────────────────────────────────────────

export interface MethodMap {
  initCueMol:              { args: [loadPath?: string];                                                    result: boolean }
  loadUserStyle:           { args: [userStylePath?: string];                                               result: boolean }
  setViewInputConfigStyle: { args: [styleName: string];                                                    result: boolean }
  terminateWorker:         { args: [];                                                                      result: void }
  addEventListener:        { args: [aCatStr: string, aSrcType: number, aEvtType: number, aSrcID: number]; result: number }
  removeEventListener:     { args: [nID: number];                                                           result: unknown }
  bindCanvas:              { args: [canvas: OffscreenCanvas, view_id: number, dpr: number];               result: boolean }
  addView:                 { args: [view_id: number, dpr: number];                                          result: boolean }
  activateView:            { args: [view_id: number];                                                       result: void }
  removeView:              { args: [view_id: number];                                                       result: boolean }
  resized:                 { args: [view_id: number, w: number, h: number, dpr: number];                   result: void }
  mouseDown:               { args: [view_id: number, event: SerializedMouseEvent];                         result: void }
  mouseUp:                 { args: [view_id: number, event: SerializedMouseEvent];                         result: void }
  mouseMove:               { args: [view_id: number, event: SerializedMouseEvent];                         result: void }
  wheel:                   { args: [view_id: number, event: SerializedWheelEvent];                         result: void }
  gesture:                 { args: [view_id: number, event: SerializedGestureEvent];                       result: void }
}

export type MethodKey = keyof MethodMap
export type MethodArgs<K extends MethodKey> = MethodMap[K]['args']
export type MethodResult<K extends MethodKey> = MethodMap[K]['result']

/** Worker-side method implementation signature (variadic positional). */
export type MethodFn<K extends MethodKey> = (
  ...args: MethodArgs<K>
) => MethodResult<K> | Promise<MethodResult<K>>

// ────────────────────────────────────────────────────────────
// RpcMap (ObjProxy bridge — `_methods` table, dispatched as RPCs)
// ────────────────────────────────────────────────────────────

export interface RpcMap {
  createObj:            { args: [className: string];                                                  result: ObjTuple | null }
  getService:           { args: [className: string];                                                  result: ObjTuple | null }
  hasClass:             { args: [className: string];                                                  result: boolean }
  getAllClassNamesJSON: { args: [];                                                                    result: string }
  getProp:              { args: [thisobj: ObjTuple, propName: string];                                result: unknown }
  setProp:              { args: [thisobj: ObjTuple, propName: string, value: unknown];                result: boolean }
  invokeMethod:         { args: [methodName: string, thisobj: ObjTuple, args: unknown[]];             result: unknown }
}

export type RpcKey = keyof RpcMap
export type RpcArgs<K extends RpcKey> = RpcMap[K]['args']
export type RpcResult<K extends RpcKey> = RpcMap[K]['result']

