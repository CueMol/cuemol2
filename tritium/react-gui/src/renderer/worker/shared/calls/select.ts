/**
 * @file worker/shared/calls/select.ts
 * @description ServiceMap slice: atom selection: compile, apply, structure browsing, sequence panel.
 *
 * One row per registered worker service. `SELECT_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  ApplyMolSelStringArgs,
  ApplyMolSelStringResult,
  CenterMolSelectionArgs,
  CenterMolSelectionResult,
  ZoomMolSelectionArgs,
  ZoomMolSelectionResult,
} from '@renderer/worker/server/services/applyMolSelString.service'
import type {
  GetMolAtomsArgs,
  GetMolAtomsResult,
  GetMolChainsArgs,
  GetMolChainsResult,
  GetMolResiduesArgs,
  GetMolResiduesResult,
} from '@renderer/worker/server/services/getMolStructure.service'
import type { GetSelDefsArgs, GetSelDefsResult } from '@renderer/worker/server/services/getSelDefs.service'
import type {
  GetSelHitCountArgs,
  GetSelHitCountResult,
} from '@renderer/worker/server/services/getSelHitCount.service'
import type {
  GetSeqPanelDataArgs,
  GetSeqPanelDataResult,
} from '@renderer/worker/server/services/getSeqPanelData.service'
import type { LassoSelectArgs, LassoSelectResult } from '@renderer/worker/server/services/lassoSelect.service'
import type { RectSelectArgs, RectSelectResult } from '@renderer/worker/server/services/rectSelect.service'
import type { SaveSelDefArgs, SaveSelDefResult } from '@renderer/worker/server/services/saveSelDef.service'
import type {
  SelectObjectMolArgs,
  SelectObjectMolResult,
} from '@renderer/worker/server/services/selectObjectMol.service'
import type {
  CenterOnResidueArgs,
  CenterOnResidueResult,
  RangeSelectResiduesArgs,
  RangeSelectResiduesResult,
  ToggleResidueSelectionArgs,
  ToggleResidueSelectionResult,
} from '@renderer/worker/server/services/seqPanelOps.service'
import type {
  ValidateSelectionArgs,
  ValidateSelectionResult,
} from '@renderer/worker/server/services/validateSelection.service'

export interface SelectCalls {
  getSelDefs:                 { args: GetSelDefsArgs; result: GetSelDefsResult }
  getSelHitCount:             { args: GetSelHitCountArgs; result: GetSelHitCountResult }
  saveSelDef:                 { args: SaveSelDefArgs; result: SaveSelDefResult }
  validateSelection:          { args: ValidateSelectionArgs; result: ValidateSelectionResult }
  selectObjectMol:            { args: SelectObjectMolArgs; result: SelectObjectMolResult }
  getMolChains:               { args: GetMolChainsArgs; result: GetMolChainsResult }
  getMolResidues:             { args: GetMolResiduesArgs; result: GetMolResiduesResult }
  getMolAtoms:                { args: GetMolAtomsArgs; result: GetMolAtomsResult }
  applyMolSelString:          { args: ApplyMolSelStringArgs; result: ApplyMolSelStringResult }
  centerMolSelection:         { args: CenterMolSelectionArgs; result: CenterMolSelectionResult }
  zoomMolSelection:           { args: ZoomMolSelectionArgs; result: ZoomMolSelectionResult }
  toggleResidueSelection:     { args: ToggleResidueSelectionArgs; result: ToggleResidueSelectionResult }
  rangeSelectResidues:        { args: RangeSelectResiduesArgs; result: RangeSelectResiduesResult }
  centerOnResidue:            { args: CenterOnResidueArgs; result: CenterOnResidueResult }
  getSeqPanelData:            { args: GetSeqPanelDataArgs; result: GetSeqPanelDataResult }
  rectSelect:                 { args: RectSelectArgs; result: RectSelectResult }
  lassoSelect:                { args: LassoSelectArgs; result: LassoSelectResult }
}

export const SELECT_KEYS = [
  'getSelDefs',
  'getSelHitCount',
  'saveSelDef',
  'validateSelection',
  'selectObjectMol',
  'getMolChains',
  'getMolResidues',
  'getMolAtoms',
  'applyMolSelString',
  'centerMolSelection',
  'zoomMolSelection',
  'toggleResidueSelection',
  'rangeSelectResidues',
  'centerOnResidue',
  'getSeqPanelData',
  'rectSelect',
  'lassoSelect',
] as const satisfies readonly (keyof SelectCalls)[]
