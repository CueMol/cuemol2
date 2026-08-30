/**
 * @file worker/shared/calls/molops.ts
 * @description ServiceMap slice: molecule editing tools (chain/residue edits, surfaces, symmetry).
 *
 * One row per registered worker service. `MOLOPS_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  AnalyzeInteractionsArgs,
  AnalyzeInteractionsResult,
} from '@renderer/worker/server/services/analyzeInteractions.service'
import type {
  ChangeChainNameArgs,
  ChangeChainNameResult,
} from '@renderer/worker/server/services/changeChainName.service'
import type {
  ChangeResidueIndexArgs,
  ChangeResidueIndexResult,
} from '@renderer/worker/server/services/changeResidueIndex.service'
import type {
  CreateSymmMolArgs,
  CreateSymmMolResult,
  GetCreateSymmMolOptionsArgs,
  GetCreateSymmMolOptionsResult,
} from '@renderer/worker/server/services/createSymmMol.service'
import type {
  CutSurfByPlaneArgs,
  CutSurfByPlaneResult,
} from '@renderer/worker/server/services/cutSurfByPlane.service'
import type {
  DeleteMolAtomsArgs,
  DeleteMolAtomsResult,
} from '@renderer/worker/server/services/deleteMolAtoms.service'
import type {
  MakeMolSurfArgs,
  MakeMolSurfResult,
  ProposeMolSurfNameArgs,
  ProposeMolSurfNameResult,
} from '@renderer/worker/server/services/makeMolSurf.service'
import type { MergeMolArgs, MergeMolResult } from '@renderer/worker/server/services/mergeMol.service'
import type {
  ReassignProt2ndryArgs,
  ReassignProt2ndryResult,
} from '@renderer/worker/server/services/reassignProt2ndry.service'
import type {
  GetMolSurfRegenInfoArgs,
  GetMolSurfRegenInfoResult,
  RegenMolSurfArgs,
  RegenMolSurfResult,
} from '@renderer/worker/server/services/regenMolSurf.service'
import type {
  SuperposeMolArgs,
  SuperposeMolResult,
} from '@renderer/worker/server/services/superposeMol.service'
import type {
  ChangeSymmetryInfoArgs,
  ChangeSymmetryInfoResult,
  GetSpaceGroupNamesArgs,
  GetSpaceGroupNamesResult,
  GetSymmetryPanelInfoArgs,
  GetSymmetryPanelInfoResult,
  ShowSymmRendererArgs,
  ShowSymmRendererResult,
  ShowUnitCellRendererArgs,
  ShowUnitCellRendererResult,
} from '@renderer/worker/server/services/symmetryPanelOps.service'

export interface MolopsCalls {
  getCreateSymmMolOptions:    { args: GetCreateSymmMolOptionsArgs; result: GetCreateSymmMolOptionsResult }
  createSymmMol:              { args: CreateSymmMolArgs; result: CreateSymmMolResult }
  getSymmetryPanelInfo:       { args: GetSymmetryPanelInfoArgs; result: GetSymmetryPanelInfoResult }
  getSpaceGroupNames:         { args: GetSpaceGroupNamesArgs; result: GetSpaceGroupNamesResult }
  changeSymmetryInfo:         { args: ChangeSymmetryInfoArgs; result: ChangeSymmetryInfoResult }
  showSymmRenderer:           { args: ShowSymmRendererArgs; result: ShowSymmRendererResult }
  showUnitCellRenderer:       { args: ShowUnitCellRendererArgs; result: ShowUnitCellRendererResult }
  changeChainName:            { args: ChangeChainNameArgs; result: ChangeChainNameResult }
  deleteMolAtoms:             { args: DeleteMolAtomsArgs; result: DeleteMolAtomsResult }
  changeResidueIndex:         { args: ChangeResidueIndexArgs; result: ChangeResidueIndexResult }
  mergeMol:                   { args: MergeMolArgs; result: MergeMolResult }
  makeMolSurf:                { args: MakeMolSurfArgs; result: MakeMolSurfResult }
  proposeMolSurfName:         { args: ProposeMolSurfNameArgs; result: ProposeMolSurfNameResult }
  getMolSurfRegenInfo:        { args: GetMolSurfRegenInfoArgs; result: GetMolSurfRegenInfoResult }
  regenMolSurf:               { args: RegenMolSurfArgs; result: RegenMolSurfResult }
  analyzeInteractions:        { args: AnalyzeInteractionsArgs; result: AnalyzeInteractionsResult }
  cutSurfByPlane:             { args: CutSurfByPlaneArgs; result: CutSurfByPlaneResult }
  reassignProt2ndry:          { args: ReassignProt2ndryArgs; result: ReassignProt2ndryResult }
  superposeMol:               { args: SuperposeMolArgs; result: SuperposeMolResult }
}

export const MOLOPS_KEYS = [
  'getCreateSymmMolOptions',
  'createSymmMol',
  'getSymmetryPanelInfo',
  'getSpaceGroupNames',
  'changeSymmetryInfo',
  'showSymmRenderer',
  'showUnitCellRenderer',
  'changeChainName',
  'deleteMolAtoms',
  'changeResidueIndex',
  'mergeMol',
  'makeMolSurf',
  'proposeMolSurfName',
  'getMolSurfRegenInfo',
  'regenMolSurf',
  'analyzeInteractions',
  'cutSurfByPlane',
  'reassignProt2ndry',
  'superposeMol',
] as const satisfies readonly (keyof MolopsCalls)[]
