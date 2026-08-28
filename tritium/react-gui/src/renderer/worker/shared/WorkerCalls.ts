/**
 * Typed contract for the renderer <-> Web Worker boundary.
 *
 * Three categories of calls flow over the same wire (`postMessage` with
 * `[method, seqno, ...args]`) but have distinct dispatch semantics on the
 * worker side; we mirror that split with three maps:
 *
 *   - ServiceMap  -> business-logic services registered via `register(name, fn)`.
 *                   Wire form: `invokeService(name, args)`. Worker side:
 *                   `fn(ctx, args[0])` (single-arg).
 *   - MethodMap   -> infrastructure / hot-path methods declared in
 *                   `WorkerService._methods`. Wire form:
 *                   `invokeMethod(name, ...positional)`. Worker side:
 *                   `fn.apply(this, args)` (variadic).
 *   - RpcMap      -> class-registry query handlers (hasClass,
 *                   getAllClassNamesJSON). Same variadic dispatch as
 *                   MethodMap, kept separate to document the query intent.
 *
 * Adding a service / method / RPC: add an entry here, then implement on the
 * worker side. Type-checking flows from this file outward.
 */

import type {
  RenderStartArgs,
  RenderStartResult,
  RenderCancelArgs,
  RenderCancelResult,
} from './renderTypes'

import type { AppInfoResult } from '../server/services/appInfo.service'
import type { GetHatchStyleSpecArgs, GetHatchStyleSpecResult } from '../server/services/hatchStyleSpec.service'
import type { DrainLogMessagesResult } from '../server/services/drainLogMessages.service'
import type { CancelAllJobsResult } from '../server/services/shutdown.service';
import type { AnimListTimelineArgs, AnimGetMgrStateArgs, AnimPlayArgs, AnimPauseArgs, AnimStopArgs, AnimGoTimeArgs, AnimSetLoopArgs, AnimSetStartCamArgs, AnimTransportResult, AnimSetElementTimeArgs, AnimAddElementArgs, AnimRemoveElementArgs, AnimMoveElementArgs, AnimEditResult, AnimAddResult } from '../server/services/animation.service'
import type { GetAnimElementDetailArgs, GetAnimElementDetailResult, SetAnimElementPropArgs, SetAnimElementPropResult, GetAnimTargetOptionsArgs, GetAnimTargetOptionsResult, GetAnimElementGenericPropsArgs, SetAnimElementGenericPropArgs, ResetAnimElementGenericPropsArgs, AnimGenericPropsResult } from '../server/services/animDetail.service'
import type { AnimTimeline, AnimMgrState } from '../../types'
import type { CreateNewSceneAndViewArgs, CreateNewSceneAndViewResult } from '../server/services/createNewSceneAndView.service'
import type { CreateViewInSceneArgs, CreateViewInSceneResult } from '../server/services/createViewInScene.service'
import type { GetCompatibleRendererNamesArgs, GetCompatibleRendererNamesResult } from '../server/services/getCompatibleRendererNames.service'
import type { GetMtzColumnInfoArgs, GetMtzColumnInfoResult } from '../server/services/getMtzColumnInfo.service'
import type { GetReaderDefaultOptionsArgs, GetReaderDefaultOptionsResult } from '../server/services/getReaderDefaultOptions.service'
import type { ProbeMapHeaderArgs, ProbeMapHeaderResult } from '../server/services/probeMapHeader.service'
import type { GetOpenFiltersArgs } from '../server/services/getOpenFilters.service'
import type { GetSceneCloseInfoArgs, GetSceneCloseInfoResult } from '../server/services/getSceneCloseInfo.service'
import type { IsSceneJustCreatedArgs, IsSceneJustCreatedResult } from '../server/services/isSceneJustCreated.service'
import type { GetViewTabLabelArgs, GetViewTabLabelResult } from '../server/services/getViewTabLabel.service'
import type { GetSelDefsArgs, GetSelDefsResult } from '../server/services/getSelDefs.service'
import type { GetMaterialNamesArgs, GetMaterialNamesResult } from '../server/services/getMaterialNames.service'
import type { GetSiblingRendererNamesArgs, GetSiblingRendererNamesResult } from '../server/services/getSiblingRendererNames.service'
import type { GetSelHitCountArgs, GetSelHitCountResult } from '../server/services/getSelHitCount.service'
import type { SaveSelDefArgs, SaveSelDefResult } from '../server/services/saveSelDef.service'
import type { LoadObjectArgs } from '../server/services/loadObject.service'
import type { LoadTrajectoryArgs } from '../server/services/loadTrajectory.service'
import type { GetTrajectoryRendererInfoResult } from '../server/services/getTrajectoryRendererInfo.service'
import type {
  GetTrajectoryStateArgs,
  TrajectoryState,
  SetTrajectoryFrameArgs,
  SetTrajectoryFrameResult,
  AppendTrajectoryBlockArgs,
  AppendTrajectoryBlockResult,
  RemoveTrajectoryBlockArgs,
  MoveTrajectoryBlockArgs,
  TrajBlockEditResult,
} from '../server/services/trajectory.service'
import type {
  ConvertToMorphMolArgs,
  ConvertToMorphMolResult,
  GetMorphFramesArgs,
  GetMorphFramesResult,
  AddMorphFrameFromFileArgs,
  AddMorphFrameFromMolArgs,
  RemoveMorphFrameArgs,
  MorphFrameEditResult,
} from '../server/services/morphMol.service'
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
import type {
  MeasurePickArgs, MeasurePickResult,
  MeasureResetArgs, MeasureResetResult,
  MeasureListTargetsArgs, MeasureListTargetsResult,
} from '../server/services/measure.service'
import type {
  BondEditPickArgs, BondEditPickResult,
  BondEditResetArgs, BondEditResetResult,
  BondEditListBondsArgs, BondEditListBondsResult,
  BondEditRemoveBondArgs, BondEditRemoveBondResult,
} from '../server/services/bondEdit.service'
import type {
  RectSelectArgs, RectSelectResult,
} from '../server/services/rectSelect.service'
import type {
  LassoSelectArgs, LassoSelectResult,
} from '../server/services/lassoSelect.service'
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
  ExportSceneArgs,
  ExportSceneResult,
  GetSceneExportInfoArgs,
  GetSceneExportInfoResult,
  GetAvailableSceneExportersResult,
} from '../server/services/exportImage.service'
import type {
  SceneBgColorArgs,
  SceneBgColorResult,
  SetSceneBgColorArgs,
  SceneColorProofingArgs,
  SceneColorProofingResult,
} from '../server/services/sceneBgColor.service'
import type {
  LabelDefaultsResult,
  SetLabelDefaultsArgs,
} from '../server/services/labelDefaults.service'
import type {
  ViewInputParamsResult,
  SetViewInputParamsArgs,
} from '../server/services/viewInputParams.service'
import type {
  CompileColorArgs,
  CompileColorResult,
  GetNamedColorsArgs,
  GetNamedColorsResult,
} from '../server/services/colorPicker.service'
import type {
  GetSceneTreeArgs,
  GetSceneTreeResult,
  SetNodeVisibleArgs,
  SetNodeVisibleResult,
  SetNodeUiCollapsedArgs,
  SetNodeUiCollapsedResult,
} from '../server/services/sceneTree.service'
import type {
  FocusOnNodeArgs,
  FocusOnNodeResult,
  DeleteNodeArgs,
  DeleteNodeResult,
  RenameNodeArgs,
  RenameNodeResult,
} from '../server/services/sceneOps.service'
import type {
  GetGenericPropsArgs,
  GetGenericPropsResult,
  SetGenericPropArgs,
  SetGenericPropResult,
  SetGenericPropsArgs,
  ResetGenericPropsArgs,
} from '../server/services/genericProps.service'
import type {
  SelectObjectMolArgs,
  SelectObjectMolResult,
} from '../server/services/selectObjectMol.service'
import type {
  GetMolChainsArgs,
  GetMolChainsResult,
  GetMolResiduesArgs,
  GetMolResiduesResult,
  GetMolAtomsArgs,
  GetMolAtomsResult,
} from '../server/services/getMolStructure.service'
import type {
  ApplyMolSelStringArgs,
  ApplyMolSelStringResult,
  CenterMolSelectionArgs,
  CenterMolSelectionResult,
  ZoomMolSelectionArgs,
  ZoomMolSelectionResult,
} from '../server/services/applyMolSelString.service'
import type {
  ToggleResidueSelectionArgs,
  ToggleResidueSelectionResult,
  RangeSelectResiduesArgs,
  RangeSelectResiduesResult,
  CenterOnResidueArgs,
  CenterOnResidueResult,
} from '../server/services/seqPanelOps.service'
import type {
  GetSeqPanelDataArgs,
  GetSeqPanelDataResult,
} from '../server/services/getSeqPanelData.service'
import type {
  CopyNodeArgs,
  CopyNodesArgs,
  CopyNodesResult,
  CopyNodeResult,
  PasteNodeArgs,
  PasteNodeResult,
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
  PaintObjectSelectionArgs,
  PaintObjectSelectionResult,
  GetObjectPaintInfoArgs,
  GetObjectPaintInfoResult,
  ListPaintCapableRenderersArgs,
  ListPaintCapableRenderersResult,
  GetRendererColoringStateArgs,
  GetRendererColoringStateResult,
  AddPaintEntryArgs,
  RemovePaintEntryArgs,
  UpdatePaintEntryArgs,
  MovePaintEntryArgs,
  PaintMutationResult,
  CopyPaintEntriesArgs,
  CopyPaintEntriesResult,
  PastePaintEntriesArgs,
  PastePaintEntriesResult,
  ClearPaintEntriesArgs,
  SetRendererDefaultColorArgs,
  SetRendererDefaultColorResult,
  SetColoringPropArgs,
  SetColoringPropResult,
  ListElePotMapObjectsArgs,
  ListElePotMapObjectsResult,
  SetRendererElepotPropArgs,
  SetRendererElepotPropResult,
  SetRendererColoringTargetArgs,
  SetRendererColoringTargetResult,
  GetMultiGradStateArgs,
  GetMultiGradStateResult,
  GetMultiGradHistogramArgs,
  GetMultiGradHistogramResult,
  SetMultiGradNodesArgs,
  SetMultiGradNodesResult,
  SetMultiGradColorMapArgs,
  SetMultiGradColorMapResult,
} from '../server/services/rendererColoring.service'
import type {
  GetRendererStyleEntriesArgs,
  GetRendererStyleEntriesResult,
  ApplyRendererStyleArgs,
  ApplyRendererStyleResult,
  GetRendererStyleEditInfoArgs,
  GetRendererStyleEditInfoResult,
  ApplyRendererStyleListArgs,
  ApplyRendererStyleListResult,
} from '../server/services/rendererStyle.service'
import type {
  GetCreateRendStyleInfoArgs,
  GetCreateRendStyleInfoResult,
  CreateStyleFromRendererArgs,
  CreateStyleFromRendererResult,
} from '../server/services/createStyleFromRenderer.service'
import type {
  GetObjectSaveInfoArgs,
  GetObjectSaveInfoResult,
  SaveObjectToFileArgs,
  SaveObjectToFileResult,
  ListSavableObjectsArgs,
  ListSavableObjectsResult,
} from '../server/services/objectSave.service'
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
import type {
  ChangeRendererTypeArgs,
  ChangeRendererTypeResult,
} from '../server/services/changeRendererType.service'
import type {
  GetRendererChangeTypesArgs,
  GetRendererChangeTypesResult,
} from '../server/services/getRendererChangeTypes.service'
import type {
  ReorderSceneNodeArgs,
  ReorderSceneNodeResult,
} from '../server/services/reorderSceneNode.service'
import type {
  BulkSetVisibleArgs,
  BulkDeleteArgs,
  BulkOpResult,
} from '../server/services/bulkSceneNodeOps.service'
import type {
  CreateRendererOnObjectArgs,
  CreateRendererOnObjectResult,
} from '../server/services/createRendererOnObject.service'
import type {
  GetNewRendererOptionsArgs,
  GetNewRendererOptionsResult,
  GetRendPresetTypesArgs,
  GetRendPresetTypesResult,
} from '../server/services/getNewRendererOptions.service'
import type {
  GetCreateSymmMolOptionsArgs,
  GetCreateSymmMolOptionsResult,
  CreateSymmMolArgs,
  CreateSymmMolResult,
} from '../server/services/createSymmMol.service'
import type {
  CreateStyleSetArgs,
  CreateStyleSetResult,
  DestroyStyleSetArgs,
  DestroyStyleSetResult,
  ToggleStyleSetReadOnlyArgs,
  ToggleStyleSetReadOnlyResult,
} from '../server/services/styleOps.service'
import type {
  LoadStyleSetFromFileArgs,
  LoadStyleSetFromFileResult,
  SaveStyleSetToFileArgs,
  SaveStyleSetToFileResult,
  SaveStyleSetToCurrentSrcArgs,
  SaveStyleSetToCurrentSrcResult,
} from '../server/services/styleFile.service'
import type {
  CreateCameraArgs,
  CreateCameraResult,
  DestroyCameraArgs,
  DestroyCameraResult,
  RenameCameraArgs,
  RenameCameraResult,
  SaveViewToCameraArgs,
  SaveViewToCameraResult,
  ApplyCameraToViewArgs,
  ApplyCameraToViewResult,
  ClearCameraVisFlagsArgs,
  ClearCameraVisFlagsResult,
} from '../server/services/cameraOps.service'
import type {
  GetCameraVisFlagsArgs,
  GetCameraVisFlagsResult,
  SetCameraVisFlagsArgs,
  SetCameraVisFlagsResult,
} from '../server/services/cameraVisFlags.service'
import type {
  ListAtomIntrDefsArgs,
  ListAtomIntrDefsResult,
  RemoveAtomIntrDefsArgs,
  RemoveAtomIntrDefsResult,
} from '../server/services/atomIntrEdit.service'
import type {
  GetStyleSetContentsArgs,
  GetStyleSetContentsResult,
  SetStyleSetColorArgs,
  RemoveStyleSetKeyArgs,
  SetStyleSetSelectionArgs,
  StyleSetEditResult,
} from '../server/services/styleSetEdit.service'
import type {
  LoadCameraFromFileArgs,
  LoadCameraFromFileResult,
  SaveCameraToFileArgs,
  SaveCameraToFileResult,
  SaveCameraToCurrentSrcArgs,
  SaveCameraToCurrentSrcResult,
  ReloadCameraFromSrcArgs,
  ReloadCameraFromSrcResult,
} from '../server/services/cameraFile.service'
import type { UndoArgs, GetUndoStateArgs, UndoState, ClearUndoDataArgs } from '../server/services/undo.service'
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
import type {
  GetViewXformArgs,
  ViewXformResult,
  SetViewXformArgs,
  SetViewXformResult,
  RotateViewArgs,
  RotateViewResult,
  TranslateViewArgs,
  TranslateViewResult,
} from '../server/services/viewXform.service'
import type {
  ListSceneObjectsArgs,
  ListSceneObjectsResult,
} from '../server/services/listSceneObjects.service'
import type {
  GetSymmetryPanelInfoArgs,
  GetSymmetryPanelInfoResult,
  GetSpaceGroupNamesArgs,
  GetSpaceGroupNamesResult,
  ChangeSymmetryInfoArgs,
  ChangeSymmetryInfoResult,
  ShowSymmRendererArgs,
  ShowSymmRendererResult,
  ShowUnitCellRendererArgs,
  ShowUnitCellRendererResult,
} from '../server/services/symmetryPanelOps.service'
import type {
  ChangeChainNameArgs,
  ChangeChainNameResult,
} from '../server/services/changeChainName.service'
import type {
  DeleteMolAtomsArgs,
  DeleteMolAtomsResult,
} from '../server/services/deleteMolAtoms.service'
import type {
  ChangeResidueIndexArgs,
  ChangeResidueIndexResult,
} from '../server/services/changeResidueIndex.service'
import type {
  MergeMolArgs,
  MergeMolResult,
} from '../server/services/mergeMol.service'
import type {
  MakeMolSurfArgs,
  MakeMolSurfResult,
  ProposeMolSurfNameArgs,
  ProposeMolSurfNameResult,
} from '../server/services/makeMolSurf.service'
import type {
  GetMolSurfRegenInfoArgs,
  GetMolSurfRegenInfoResult,
  RegenMolSurfArgs,
  RegenMolSurfResult,
} from '../server/services/regenMolSurf.service'
import type {
  CalcApbsStartArgs,
  CalcApbsStartResult,
  CalcApbsCancelArgs,
  CalcApbsCancelResult,
  ProposeElepotNameArgs,
  ProposeElepotNameResult,
} from './apbsTypes'
import type {
  AnalyzeInteractionsArgs,
  AnalyzeInteractionsResult,
} from '../server/services/analyzeInteractions.service'
import type {
  CutSurfByPlaneArgs,
  CutSurfByPlaneResult,
} from '../server/services/cutSurfByPlane.service'
import type {
  ReassignProt2ndryArgs,
  ReassignProt2ndryResult,
} from '../server/services/reassignProt2ndry.service'
import type {
  SuperposeMolArgs,
  SuperposeMolResult,
} from '../server/services/superposeMol.service'
import type {
  ListMapRenderersArgs,
  ListMapRenderersResult,
  GetMapRendererStateArgs,
  GetMapRendererStateResult,
  SetMapRendererPropArgs,
  SetMapRendererPropResult,
  RedrawMapCenterArgs,
  RedrawMapCenterResult,
} from '../server/services/densityMapPanelOps.service'
import type { ElectronFileFilter } from '@shared/types/fileDialog'
import type { WorkerContext } from '../server/types/WorkerContext'

// -
// Serialized DOM events (worker side cannot read live DOM events)
// -

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

// -
// ServiceMap (registered services -- `_registered` table)
// -

export interface ServiceMap {
  appInfo:                    { args: Record<string, never>;          result: AppInfoResult }
  drainLogMessages:           { args: Record<string, never>;          result: DrainLogMessagesResult }
  cancelAllJobs:              { args: Record<string, never>;          result: CancelAllJobsResult }
  createNewSceneAndView:      { args: CreateNewSceneAndViewArgs;       result: CreateNewSceneAndViewResult }
  createViewInScene:          { args: CreateViewInSceneArgs;           result: CreateViewInSceneResult }
  getCompatibleRendererNames: { args: GetCompatibleRendererNamesArgs;  result: GetCompatibleRendererNamesResult }
  getMtzColumnInfo:           { args: GetMtzColumnInfoArgs;            result: GetMtzColumnInfoResult }
  getReaderDefaultOptions:    { args: GetReaderDefaultOptionsArgs;     result: GetReaderDefaultOptionsResult }
  probeMapHeader:             { args: ProbeMapHeaderArgs;              result: ProbeMapHeaderResult }
  getOpenFilters:             { args: GetOpenFiltersArgs;              result: ElectronFileFilter[] }
  getSceneCloseInfo:          { args: GetSceneCloseInfoArgs;           result: GetSceneCloseInfoResult }
  isSceneJustCreated:         { args: IsSceneJustCreatedArgs;          result: IsSceneJustCreatedResult }
  getViewTabLabel:            { args: GetViewTabLabelArgs;             result: GetViewTabLabelResult }
  getSelDefs:                 { args: GetSelDefsArgs;                  result: GetSelDefsResult }
  getMaterialNames:           { args: GetMaterialNamesArgs;            result: GetMaterialNamesResult }
  getSiblingRendererNames:    { args: GetSiblingRendererNamesArgs;     result: GetSiblingRendererNamesResult }
  getSelHitCount:             { args: GetSelHitCountArgs;              result: GetSelHitCountResult }
  saveSelDef:                 { args: SaveSelDefArgs;                  result: SaveSelDefResult }
  loadObject:                 { args: LoadObjectArgs;                  result: { ok: boolean } }
  loadTrajectory:             { args: LoadTrajectoryArgs;              result: { ok: boolean; objId?: number } }
  getTrajectoryRendererInfo:  { args: Record<string, never>;          result: GetTrajectoryRendererInfoResult }
  getTrajectoryState:         { args: GetTrajectoryStateArgs;          result: TrajectoryState }
  setTrajectoryFrame:         { args: SetTrajectoryFrameArgs;          result: SetTrajectoryFrameResult }
  appendTrajectoryBlock:      { args: AppendTrajectoryBlockArgs;       result: AppendTrajectoryBlockResult }
  removeTrajectoryBlock:      { args: RemoveTrajectoryBlockArgs;       result: TrajBlockEditResult }
  moveTrajectoryBlock:        { args: MoveTrajectoryBlockArgs;         result: TrajBlockEditResult }
  convertToMorphMol:          { args: ConvertToMorphMolArgs;           result: ConvertToMorphMolResult }
  getMorphFrames:             { args: GetMorphFramesArgs;              result: GetMorphFramesResult }
  addMorphFrameFromFile:      { args: AddMorphFrameFromFileArgs;       result: MorphFrameEditResult }
  addMorphFrameFromMol:       { args: AddMorphFrameFromMolArgs;        result: MorphFrameEditResult }
  removeMorphFrame:           { args: RemoveMorphFrameArgs;            result: MorphFrameEditResult }
  loadScene:                  { args: LoadSceneArgs;                   result: { ok: boolean } }
  streamLoadFromUrl:          { args: StreamLoadFromUrlArgs;           result: StreamLoadFromUrlResult }
  streamLoadDensityMap:       { args: StreamLoadDensityMapArgs;        result: StreamLoadDensityMapResult }
  cancelStreamLoad:           { args: CancelStreamLoadArgs;            result: CancelStreamLoadResult }
  renderStart:                { args: RenderStartArgs;                 result: RenderStartResult }
  renderCancel:               { args: RenderCancelArgs;                result: RenderCancelResult }
  proposeNewTabNames:         { args: ProposeNewTabNamesArgs;          result: ProposeNewTabNamesResult }
  proposeUniqName:            { args: ProposeUniqNameArgs;             result: ProposeUniqNameResult }
  redo:                       { args: RedoArgs;                        result: { ok: boolean } }
  undo:                       { args: UndoArgs;                        result: { ok: boolean } }
  getUndoState:               { args: GetUndoStateArgs;                result: UndoState }
  clearUndoData:              { args: ClearUndoDataArgs;               result: { ok: boolean } }
  getSceneSaveInfo:           { args: GetSceneSaveInfoArgs;            result: GetSceneSaveInfoResult }
  saveScene:                  { args: SaveSceneArgs;                   result: SaveSceneResult }
  exportScene:                { args: ExportSceneArgs;                 result: ExportSceneResult }
  getSceneExportInfo:         { args: GetSceneExportInfoArgs;          result: GetSceneExportInfoResult }
  getAvailableSceneExporters: { args: void;                            result: GetAvailableSceneExportersResult }
  validateSelection:          { args: ValidateSelectionArgs;           result: ValidateSelectionResult }
  getSceneBgColor:            { args: SceneBgColorArgs;                result: SceneBgColorResult }
  setSceneBgColor:            { args: SetSceneBgColorArgs;             result: SceneBgColorResult }
  getLabelDefaults:           { args: Record<string, never>;          result: LabelDefaultsResult }
  setLabelDefaults:           { args: SetLabelDefaultsArgs;            result: { ok: boolean } }
  getViewInputParams:         { args: Record<string, never>;          result: ViewInputParamsResult }
  setViewInputParams:         { args: SetViewInputParamsArgs;          result: { ok: boolean } }
  getSceneColorProofing:      { args: SceneColorProofingArgs;          result: SceneColorProofingResult }
  toggleSceneColorProofing:   { args: SceneColorProofingArgs;          result: SceneColorProofingResult }
  compileColor:               { args: CompileColorArgs;                result: CompileColorResult }
  getNamedColors:             { args: GetNamedColorsArgs;              result: GetNamedColorsResult }
  getSceneTree:               { args: GetSceneTreeArgs;                result: GetSceneTreeResult }
  setNodeVisible:             { args: SetNodeVisibleArgs;              result: SetNodeVisibleResult }
  setNodeUiCollapsed:         { args: SetNodeUiCollapsedArgs;          result: SetNodeUiCollapsedResult }
  focusOnNode:                { args: FocusOnNodeArgs;                 result: FocusOnNodeResult }
  deleteNode:                 { args: DeleteNodeArgs;                  result: DeleteNodeResult }
  getGenericProps:            { args: GetGenericPropsArgs;             result: GetGenericPropsResult }
  setGenericProp:             { args: SetGenericPropArgs;              result: SetGenericPropResult }
  setGenericProps:            { args: SetGenericPropsArgs;             result: SetGenericPropResult }
  resetGenericProps:          { args: ResetGenericPropsArgs;           result: SetGenericPropResult }
  renameNode:                 { args: RenameNodeArgs;                  result: RenameNodeResult }
  selectObjectMol:            { args: SelectObjectMolArgs;             result: SelectObjectMolResult }
  getMolChains:               { args: GetMolChainsArgs;                result: GetMolChainsResult }
  getMolResidues:             { args: GetMolResiduesArgs;              result: GetMolResiduesResult }
  getMolAtoms:                { args: GetMolAtomsArgs;                 result: GetMolAtomsResult }
  applyMolSelString:          { args: ApplyMolSelStringArgs;           result: ApplyMolSelStringResult }
  centerMolSelection:         { args: CenterMolSelectionArgs;          result: CenterMolSelectionResult }
  zoomMolSelection:           { args: ZoomMolSelectionArgs;            result: ZoomMolSelectionResult }
  toggleResidueSelection:     { args: ToggleResidueSelectionArgs;      result: ToggleResidueSelectionResult }
  rangeSelectResidues:        { args: RangeSelectResiduesArgs;         result: RangeSelectResiduesResult }
  centerOnResidue:            { args: CenterOnResidueArgs;             result: CenterOnResidueResult }
  getSeqPanelData:            { args: GetSeqPanelDataArgs;             result: GetSeqPanelDataResult }
  copyNode:                   { args: CopyNodeArgs;                    result: CopyNodeResult }
  copyNodes:                  { args: CopyNodesArgs;                   result: CopyNodesResult }
  pasteNode:                  { args: PasteNodeArgs;                   result: PasteNodeResult }
  setRendererColoring:        { args: SetRendererColoringArgs;         result: SetRendererColoringResult }
  getPaintColoringStyles:     { args: GetPaintColoringStylesArgs;      result: GetPaintColoringStylesResult }
  paintRendererSelection:     { args: PaintRendererSelectionArgs;      result: PaintRendererSelectionResult }
  getRendererPaintInfo:       { args: GetRendererPaintInfoArgs;        result: GetRendererPaintInfoResult }
  paintObjectSelection:       { args: PaintObjectSelectionArgs;        result: PaintObjectSelectionResult }
  getObjectPaintInfo:         { args: GetObjectPaintInfoArgs;          result: GetObjectPaintInfoResult }
  listPaintCapableRenderers:  { args: ListPaintCapableRenderersArgs;   result: ListPaintCapableRenderersResult }
  getRendererColoringState:   { args: GetRendererColoringStateArgs;    result: GetRendererColoringStateResult }
  addPaintEntry:              { args: AddPaintEntryArgs;               result: PaintMutationResult }
  removePaintEntry:           { args: RemovePaintEntryArgs;            result: PaintMutationResult }
  updatePaintEntry:           { args: UpdatePaintEntryArgs;            result: PaintMutationResult }
  movePaintEntry:             { args: MovePaintEntryArgs;              result: PaintMutationResult }
  copyPaintEntries:           { args: CopyPaintEntriesArgs;            result: CopyPaintEntriesResult }
  cutPaintEntries:            { args: CopyPaintEntriesArgs;            result: CopyPaintEntriesResult }
  removePaintEntries:         { args: CopyPaintEntriesArgs;            result: PaintMutationResult }
  pastePaintEntries:          { args: PastePaintEntriesArgs;           result: PastePaintEntriesResult }
  clearPaintEntries:          { args: ClearPaintEntriesArgs;           result: PaintMutationResult }
  setRendererDefaultColor:    { args: SetRendererDefaultColorArgs;     result: SetRendererDefaultColorResult }
  setColoringProp:            { args: SetColoringPropArgs;             result: SetColoringPropResult }
  listElePotMapObjects:       { args: ListElePotMapObjectsArgs;        result: ListElePotMapObjectsResult }
  setRendererElepotProp:      { args: SetRendererElepotPropArgs;       result: SetRendererElepotPropResult }
  setRendererColoringTarget:  { args: SetRendererColoringTargetArgs;   result: SetRendererColoringTargetResult }
  getMultiGradState:          { args: GetMultiGradStateArgs;           result: GetMultiGradStateResult }
  getMultiGradHistogram:      { args: GetMultiGradHistogramArgs;       result: GetMultiGradHistogramResult }
  setMultiGradNodes:          { args: SetMultiGradNodesArgs;           result: SetMultiGradNodesResult }
  setMultiGradColorMap:       { args: SetMultiGradColorMapArgs;        result: SetMultiGradColorMapResult }
  getRendererStyleEntries:    { args: GetRendererStyleEntriesArgs;     result: GetRendererStyleEntriesResult }
  applyRendererStyle:         { args: ApplyRendererStyleArgs;          result: ApplyRendererStyleResult }
  getRendererStyleEditInfo:   { args: GetRendererStyleEditInfoArgs;    result: GetRendererStyleEditInfoResult }
  applyRendererStyleList:     { args: ApplyRendererStyleListArgs;      result: ApplyRendererStyleListResult }
  getCreateRendStyleInfo:     { args: GetCreateRendStyleInfoArgs;      result: GetCreateRendStyleInfoResult }
  createStyleFromRenderer:    { args: CreateStyleFromRendererArgs;     result: CreateStyleFromRendererResult }
  getObjectSaveInfo:          { args: GetObjectSaveInfoArgs;           result: GetObjectSaveInfoResult }
  saveObjectToFile:           { args: SaveObjectToFileArgs;            result: SaveObjectToFileResult }
  listSavableObjects:         { args: ListSavableObjectsArgs;          result: ListSavableObjectsResult }
  setRendererSelection:       { args: SetRendererSelectionArgs;        result: SetRendererSelectionResult }
  generateRendererSurfObj:    { args: GenerateRendererSurfObjArgs;     result: GenerateRendererSurfObjResult }
  createRendererGroup:        { args: CreateRendererGroupArgs;         result: CreateRendererGroupResult }
  changeRendererType:         { args: ChangeRendererTypeArgs;          result: ChangeRendererTypeResult }
  getRendererChangeTypes:     { args: GetRendererChangeTypesArgs;      result: GetRendererChangeTypesResult }
  reorderSceneNode:           { args: ReorderSceneNodeArgs;            result: ReorderSceneNodeResult }
  bulkSetNodeVisible:         { args: BulkSetVisibleArgs;              result: BulkOpResult }
  bulkDeleteNode:             { args: BulkDeleteArgs;                  result: BulkOpResult }
  createRendererOnObject:     { args: CreateRendererOnObjectArgs;      result: CreateRendererOnObjectResult }
  getNewRendererOptions:      { args: GetNewRendererOptionsArgs;       result: GetNewRendererOptionsResult }
  getRendPresetTypes:         { args: GetRendPresetTypesArgs;          result: GetRendPresetTypesResult }
  createStyleSet:             { args: CreateStyleSetArgs;              result: CreateStyleSetResult }
  destroyStyleSet:            { args: DestroyStyleSetArgs;             result: DestroyStyleSetResult }
  toggleStyleSetReadOnly:     { args: ToggleStyleSetReadOnlyArgs;      result: ToggleStyleSetReadOnlyResult }
  loadStyleSetFromFile:       { args: LoadStyleSetFromFileArgs;        result: LoadStyleSetFromFileResult }
  saveStyleSetToFile:         { args: SaveStyleSetToFileArgs;          result: SaveStyleSetToFileResult }
  saveStyleSetToCurrentSrc:   { args: SaveStyleSetToCurrentSrcArgs;    result: SaveStyleSetToCurrentSrcResult }
  createCamera:               { args: CreateCameraArgs;                result: CreateCameraResult }
  destroyCamera:              { args: DestroyCameraArgs;               result: DestroyCameraResult }
  renameCamera:               { args: RenameCameraArgs;                result: RenameCameraResult }
  saveViewToCamera:           { args: SaveViewToCameraArgs;            result: SaveViewToCameraResult }
  applyCameraToView:          { args: ApplyCameraToViewArgs;           result: ApplyCameraToViewResult }
  clearCameraVisFlags:        { args: ClearCameraVisFlagsArgs;         result: ClearCameraVisFlagsResult }
  getCameraVisFlags:          { args: GetCameraVisFlagsArgs;           result: GetCameraVisFlagsResult }
  setCameraVisFlags:          { args: SetCameraVisFlagsArgs;           result: SetCameraVisFlagsResult }
  listAtomIntrDefs:           { args: ListAtomIntrDefsArgs;            result: ListAtomIntrDefsResult }
  removeAtomIntrDefs:         { args: RemoveAtomIntrDefsArgs;          result: RemoveAtomIntrDefsResult }
  getStyleSetContents:        { args: GetStyleSetContentsArgs;         result: GetStyleSetContentsResult }
  setStyleSetColor:           { args: SetStyleSetColorArgs;            result: StyleSetEditResult }
  removeStyleSetColor:        { args: RemoveStyleSetKeyArgs;           result: StyleSetEditResult }
  setStyleSetSelection:       { args: SetStyleSetSelectionArgs;        result: StyleSetEditResult }
  removeStyleSetSelection:    { args: RemoveStyleSetKeyArgs;           result: StyleSetEditResult }
  removeStyleSetStyle:        { args: RemoveStyleSetKeyArgs;           result: StyleSetEditResult }
  loadCameraFromFile:         { args: LoadCameraFromFileArgs;          result: LoadCameraFromFileResult }
  saveCameraToFile:           { args: SaveCameraToFileArgs;            result: SaveCameraToFileResult }
  saveCameraToCurrentSrc:     { args: SaveCameraToCurrentSrcArgs;      result: SaveCameraToCurrentSrcResult }
  reloadCameraFromSrc:        { args: ReloadCameraFromSrcArgs;         result: ReloadCameraFromSrcResult }
  getViewProjection:          { args: ViewProjectionArgs;              result: ViewProjectionResult }
  getHatchStyleSpec:          { args: GetHatchStyleSpecArgs;           result: GetHatchStyleSpecResult }
  setViewProjection:          { args: ViewProjectionArgs;              result: ViewProjectionResult }
  getViewCenterMark:          { args: ViewCenterMarkArgs;              result: ViewCenterMarkResult }
  setViewCenterMark:          { args: ViewCenterMarkArgs;              result: ViewCenterMarkResult }
  getViewXform:               { args: GetViewXformArgs;                result: ViewXformResult }
  setViewXform:               { args: SetViewXformArgs;                result: SetViewXformResult }
  rotateView:                 { args: RotateViewArgs;                  result: RotateViewResult }
  translateView:              { args: TranslateViewArgs;               result: TranslateViewResult }
  naviHitTest:                { args: NaviHitTestArgs;                 result: NaviHitTestResult }
  naviClickAtom:              { args: NaviClickAtomArgs;               result: NaviClickAtomResult }
  naviResidSel:               { args: NaviResidSelArgs;                result: NaviResidSelResult }
  measurePick:                { args: MeasurePickArgs;                 result: MeasurePickResult }
  measureReset:               { args: MeasureResetArgs;                result: MeasureResetResult }
  measureListTargets:         { args: MeasureListTargetsArgs;          result: MeasureListTargetsResult }
  bondEditPick:               { args: BondEditPickArgs;                result: BondEditPickResult }
  bondEditReset:              { args: BondEditResetArgs;               result: BondEditResetResult }
  bondEditListBonds:          { args: BondEditListBondsArgs;           result: BondEditListBondsResult }
  bondEditRemoveBond:         { args: BondEditRemoveBondArgs;          result: BondEditRemoveBondResult }
  rectSelect:                 { args: RectSelectArgs;                  result: RectSelectResult }
  lassoSelect:                { args: LassoSelectArgs;                 result: LassoSelectResult }
  naviCenterAt:               { args: NaviCenterAtArgs;                result: { ok: boolean } }
  naviCenterAtSymm:           { args: NaviCenterAtSymmArgs;            result: { ok: boolean } }
  naviCtxSelect:              { args: NaviCtxSelectArgs;               result: { ok: boolean } }
  naviCtxAddSelect:           { args: NaviCtxSelectArgs;               result: { ok: boolean } }
  naviCtxUnselect:            { args: NaviCtxObjArgs;                  result: { ok: boolean } }
  naviCtxInvertSel:           { args: NaviCtxObjArgs;                  result: { ok: boolean } }
  naviCtxToggleSidechain:     { args: NaviCtxObjArgs;                  result: { ok: boolean } }
  naviCtxAround:              { args: NaviCtxAroundArgs;               result: { ok: boolean } }
  getCreateSymmMolOptions:    { args: GetCreateSymmMolOptionsArgs;     result: GetCreateSymmMolOptionsResult }
  createSymmMol:              { args: CreateSymmMolArgs;               result: CreateSymmMolResult }
  listSceneObjects:           { args: ListSceneObjectsArgs;            result: ListSceneObjectsResult }
  getSymmetryPanelInfo:       { args: GetSymmetryPanelInfoArgs;        result: GetSymmetryPanelInfoResult }
  getSpaceGroupNames:         { args: GetSpaceGroupNamesArgs;          result: GetSpaceGroupNamesResult }
  changeSymmetryInfo:         { args: ChangeSymmetryInfoArgs;          result: ChangeSymmetryInfoResult }
  showSymmRenderer:           { args: ShowSymmRendererArgs;            result: ShowSymmRendererResult }
  showUnitCellRenderer:       { args: ShowUnitCellRendererArgs;        result: ShowUnitCellRendererResult }
  changeChainName:            { args: ChangeChainNameArgs;             result: ChangeChainNameResult }
  deleteMolAtoms:             { args: DeleteMolAtomsArgs;              result: DeleteMolAtomsResult }
  changeResidueIndex:         { args: ChangeResidueIndexArgs;          result: ChangeResidueIndexResult }
  mergeMol:                   { args: MergeMolArgs;                    result: MergeMolResult }
  makeMolSurf:                { args: MakeMolSurfArgs;                 result: MakeMolSurfResult }
  proposeMolSurfName:         { args: ProposeMolSurfNameArgs;          result: ProposeMolSurfNameResult }
  getMolSurfRegenInfo:        { args: GetMolSurfRegenInfoArgs;         result: GetMolSurfRegenInfoResult }
  regenMolSurf:               { args: RegenMolSurfArgs;                result: RegenMolSurfResult }
  calcApbsStart:              { args: CalcApbsStartArgs;               result: CalcApbsStartResult }
  calcApbsCancel:             { args: CalcApbsCancelArgs;              result: CalcApbsCancelResult }
  proposeElepotName:          { args: ProposeElepotNameArgs;           result: ProposeElepotNameResult }
  analyzeInteractions:        { args: AnalyzeInteractionsArgs;         result: AnalyzeInteractionsResult }
  cutSurfByPlane:             { args: CutSurfByPlaneArgs;              result: CutSurfByPlaneResult }
  reassignProt2ndry:          { args: ReassignProt2ndryArgs;           result: ReassignProt2ndryResult }
  superposeMol:               { args: SuperposeMolArgs;                result: SuperposeMolResult }
  listMapRenderers:           { args: ListMapRenderersArgs;            result: ListMapRenderersResult }
  getMapRendererState:        { args: GetMapRendererStateArgs;         result: GetMapRendererStateResult }
  setMapRendererProp:         { args: SetMapRendererPropArgs;          result: SetMapRendererPropResult }
  redrawMapCenter:            { args: RedrawMapCenterArgs;             result: RedrawMapCenterResult }
  animListTimeline:           { args: AnimListTimelineArgs;            result: AnimTimeline }
  animGetMgrState:            { args: AnimGetMgrStateArgs;             result: AnimMgrState }
  animPlay:                   { args: AnimPlayArgs;                    result: AnimTransportResult }
  animPause:                  { args: AnimPauseArgs;                   result: AnimTransportResult }
  animStop:                   { args: AnimStopArgs;                    result: AnimTransportResult }
  animGoTime:                 { args: AnimGoTimeArgs;                  result: AnimTransportResult }
  animSetLoop:                { args: AnimSetLoopArgs;                 result: AnimTransportResult }
  animSetStartCam:            { args: AnimSetStartCamArgs;             result: AnimTransportResult }
  animSetElementTime:         { args: AnimSetElementTimeArgs;          result: AnimEditResult }
  animAddElement:             { args: AnimAddElementArgs;              result: AnimAddResult }
  animRemoveElement:          { args: AnimRemoveElementArgs;           result: AnimEditResult }
  animMoveElement:            { args: AnimMoveElementArgs;             result: AnimEditResult }
  getAnimElementDetail:       { args: GetAnimElementDetailArgs;        result: GetAnimElementDetailResult }
  setAnimElementProp:         { args: SetAnimElementPropArgs;          result: SetAnimElementPropResult }
  getAnimTargetOptions:       { args: GetAnimTargetOptionsArgs;        result: GetAnimTargetOptionsResult }
  getAnimElementGenericProps: { args: GetAnimElementGenericPropsArgs;  result: AnimGenericPropsResult }
  setAnimElementGenericProp:  { args: SetAnimElementGenericPropArgs;   result: AnimGenericPropsResult }
  resetAnimElementGenericProps: { args: ResetAnimElementGenericPropsArgs; result: AnimGenericPropsResult }
}

export type ServiceKey = keyof ServiceMap
export type ServiceArgs<K extends ServiceKey> = ServiceMap[K]['args']
export type ServiceResult<K extends ServiceKey> = ServiceMap[K]['result']

/** Worker-side service implementation signature. */
export type ServiceFn<K extends ServiceKey> = (
  ctx: WorkerContext,
  args: ServiceArgs<K>,
) => ServiceResult<K> | Promise<ServiceResult<K>>

// -
// MethodMap (infrastructure / hot-path -- `_methods` table)
// -

export interface MethodMap {
  initCueMol:              { args: [loadPath?: string];                                                    result: boolean }
  loadUserStyle:           { args: [userStylePath?: string];                                               result: boolean }
  saveUserStyle:           { args: [userStylePath: string];                                                result: boolean }
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

// -
// RpcMap (class-registry queries -- `_methods` table, dispatched as RPCs)
// -

export interface RpcMap {
  hasClass:             { args: [className: string];                                                  result: boolean }
  getAllClassNamesJSON: { args: [];                                                                    result: string }
}

export type RpcKey = keyof RpcMap
export type RpcArgs<K extends RpcKey> = RpcMap[K]['args']
export type RpcResult<K extends RpcKey> = RpcMap[K]['result']

