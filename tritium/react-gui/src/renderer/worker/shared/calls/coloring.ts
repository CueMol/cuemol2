/**
 * @file worker/shared/calls/coloring.ts
 * @description ServiceMap slice: renderer / object colouring and the Paint table.
 *
 * One row per registered worker service. `COLORING_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  AddPaintEntryArgs,
  ClearPaintEntriesArgs,
  CopyPaintEntriesArgs,
  CopyPaintEntriesResult,
  GetMultiGradHistogramArgs,
  GetMultiGradHistogramResult,
  GetMultiGradStateArgs,
  GetMultiGradStateResult,
  GetObjectPaintInfoArgs,
  GetObjectPaintInfoResult,
  GetPaintColoringStylesArgs,
  GetPaintColoringStylesResult,
  GetRendererColoringStateArgs,
  GetRendererColoringStateResult,
  GetRendererPaintInfoArgs,
  GetRendererPaintInfoResult,
  ListElePotMapObjectsArgs,
  ListElePotMapObjectsResult,
  ListPaintCapableRenderersArgs,
  ListPaintCapableRenderersResult,
  MovePaintEntryArgs,
  PaintMutationResult,
  PaintObjectSelectionArgs,
  PaintObjectSelectionResult,
  PaintRendererSelectionArgs,
  PaintRendererSelectionResult,
  PastePaintEntriesArgs,
  PastePaintEntriesResult,
  RemovePaintEntryArgs,
  SetColoringPropArgs,
  SetColoringPropResult,
  SetMultiGradColorMapArgs,
  SetMultiGradColorMapResult,
  SetMultiGradNodesArgs,
  SetMultiGradNodesResult,
  SetRendererColoringArgs,
  SetRendererColoringResult,
  SetRendererColoringTargetArgs,
  SetRendererColoringTargetResult,
  SetRendererDefaultColorArgs,
  SetRendererDefaultColorResult,
  SetRendererElepotPropArgs,
  SetRendererElepotPropResult,
  UpdatePaintEntryArgs,
} from '../../server/services/rendererColoring.service'

export interface ColoringCalls {
  setRendererColoring:        { args: SetRendererColoringArgs; result: SetRendererColoringResult }
  getPaintColoringStyles:     { args: GetPaintColoringStylesArgs; result: GetPaintColoringStylesResult }
  paintRendererSelection:     { args: PaintRendererSelectionArgs; result: PaintRendererSelectionResult }
  getRendererPaintInfo:       { args: GetRendererPaintInfoArgs; result: GetRendererPaintInfoResult }
  paintObjectSelection:       { args: PaintObjectSelectionArgs; result: PaintObjectSelectionResult }
  getObjectPaintInfo:         { args: GetObjectPaintInfoArgs; result: GetObjectPaintInfoResult }
  listPaintCapableRenderers:  { args: ListPaintCapableRenderersArgs; result: ListPaintCapableRenderersResult }
  getRendererColoringState:   { args: GetRendererColoringStateArgs; result: GetRendererColoringStateResult }
  addPaintEntry:              { args: AddPaintEntryArgs; result: PaintMutationResult }
  removePaintEntry:           { args: RemovePaintEntryArgs; result: PaintMutationResult }
  updatePaintEntry:           { args: UpdatePaintEntryArgs; result: PaintMutationResult }
  movePaintEntry:             { args: MovePaintEntryArgs; result: PaintMutationResult }
  copyPaintEntries:           { args: CopyPaintEntriesArgs; result: CopyPaintEntriesResult }
  cutPaintEntries:            { args: CopyPaintEntriesArgs; result: CopyPaintEntriesResult }
  removePaintEntries:         { args: CopyPaintEntriesArgs; result: PaintMutationResult }
  pastePaintEntries:          { args: PastePaintEntriesArgs; result: PastePaintEntriesResult }
  clearPaintEntries:          { args: ClearPaintEntriesArgs; result: PaintMutationResult }
  setRendererDefaultColor:    { args: SetRendererDefaultColorArgs; result: SetRendererDefaultColorResult }
  setColoringProp:            { args: SetColoringPropArgs; result: SetColoringPropResult }
  listElePotMapObjects:       { args: ListElePotMapObjectsArgs; result: ListElePotMapObjectsResult }
  setRendererElepotProp:      { args: SetRendererElepotPropArgs; result: SetRendererElepotPropResult }
  setRendererColoringTarget:  { args: SetRendererColoringTargetArgs; result: SetRendererColoringTargetResult }
  getMultiGradState:          { args: GetMultiGradStateArgs; result: GetMultiGradStateResult }
  getMultiGradHistogram:      { args: GetMultiGradHistogramArgs; result: GetMultiGradHistogramResult }
  setMultiGradNodes:          { args: SetMultiGradNodesArgs; result: SetMultiGradNodesResult }
  setMultiGradColorMap:       { args: SetMultiGradColorMapArgs; result: SetMultiGradColorMapResult }
}

export const COLORING_KEYS = [
  'setRendererColoring',
  'getPaintColoringStyles',
  'paintRendererSelection',
  'getRendererPaintInfo',
  'paintObjectSelection',
  'getObjectPaintInfo',
  'listPaintCapableRenderers',
  'getRendererColoringState',
  'addPaintEntry',
  'removePaintEntry',
  'updatePaintEntry',
  'movePaintEntry',
  'copyPaintEntries',
  'cutPaintEntries',
  'removePaintEntries',
  'pastePaintEntries',
  'clearPaintEntries',
  'setRendererDefaultColor',
  'setColoringProp',
  'listElePotMapObjects',
  'setRendererElepotProp',
  'setRendererColoringTarget',
  'getMultiGradState',
  'getMultiGradHistogram',
  'setMultiGradNodes',
  'setMultiGradColorMap',
] as const satisfies readonly (keyof ColoringCalls)[]
