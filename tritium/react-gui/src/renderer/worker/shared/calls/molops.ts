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
} from '@renderer/worker/server/services/molops/analyzeInteractions'
import type {
  ChangeChainNameArgs,
  ChangeChainNameResult,
} from '@renderer/worker/server/services/molops/changeChainName'
import type {
  ChangeResidueIndexArgs,
  ChangeResidueIndexResult,
} from '@renderer/worker/server/services/molops/changeResidueIndex'
import type {
  CreateSymmMolArgs,
  CreateSymmMolResult,
  GetCreateSymmMolOptionsArgs,
  GetCreateSymmMolOptionsResult,
} from '@renderer/worker/server/services/molops/createSymmMol'
import type {
  CutSurfByPlaneArgs,
  CutSurfByPlaneResult,
} from '@renderer/worker/server/services/molops/cutSurfByPlane'
import type {
  DeleteMolAtomsArgs,
  DeleteMolAtomsResult,
} from '@renderer/worker/server/services/molops/deleteMolAtoms'
import type {
  MakeMolSurfArgs,
  MakeMolSurfResult,
  ProposeMolSurfNameArgs,
  ProposeMolSurfNameResult,
} from '@renderer/worker/server/services/molops/makeMolSurf'
import type { MergeMolArgs, MergeMolResult } from '@renderer/worker/server/services/molops/mergeMol'
import type {
  ReassignProt2ndryArgs,
  ReassignProt2ndryResult,
} from '@renderer/worker/server/services/molops/reassignProt2ndry'
import type {
  GetMolSurfRegenInfoArgs,
  GetMolSurfRegenInfoResult,
  RegenMolSurfArgs,
  RegenMolSurfResult,
} from '@renderer/worker/server/services/molops/regenMolSurf'
import type {
  SuperposeMolArgs,
  SuperposeMolResult,
} from '@renderer/worker/server/services/molops/superposeMol'
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
} from '@renderer/worker/server/services/molops/symmetryPanelOps'

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
