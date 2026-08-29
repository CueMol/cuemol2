/**
 * @file worker/shared/calls/rend.ts
 * @description ServiceMap slice: renderers: creation, type, selection, style application, materials.
 *
 * One row per registered worker service. `REND_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  ListAtomIntrDefsArgs,
  ListAtomIntrDefsResult,
  RemoveAtomIntrDefsArgs,
  RemoveAtomIntrDefsResult,
} from '../../server/services/atomIntrEdit.service'
import type {
  ChangeRendererTypeArgs,
  ChangeRendererTypeResult,
} from '../../server/services/changeRendererType.service'
import type {
  CreateRendererGroupArgs,
  CreateRendererGroupResult,
} from '../../server/services/createRendererGroup.service'
import type {
  CreateRendererOnObjectArgs,
  CreateRendererOnObjectResult,
} from '../../server/services/createRendererOnObject.service'
import type {
  CreateStyleFromRendererArgs,
  CreateStyleFromRendererResult,
  GetCreateRendStyleInfoArgs,
  GetCreateRendStyleInfoResult,
} from '../../server/services/createStyleFromRenderer.service'
import type {
  GenerateRendererSurfObjArgs,
  GenerateRendererSurfObjResult,
} from '../../server/services/generateRendererSurfObj.service'
import type {
  GetMaterialNamesArgs,
  GetMaterialNamesResult,
} from '../../server/services/getMaterialNames.service'
import type {
  GetNewRendererOptionsArgs,
  GetNewRendererOptionsResult,
  GetRendPresetTypesArgs,
  GetRendPresetTypesResult,
} from '../../server/services/getNewRendererOptions.service'
import type {
  GetRendererChangeTypesArgs,
  GetRendererChangeTypesResult,
} from '../../server/services/getRendererChangeTypes.service'
import type {
  GetSiblingRendererNamesArgs,
  GetSiblingRendererNamesResult,
} from '../../server/services/getSiblingRendererNames.service'
import type {
  ApplyRendererStyleArgs,
  ApplyRendererStyleListArgs,
  ApplyRendererStyleListResult,
  ApplyRendererStyleResult,
  GetRendererStyleEditInfoArgs,
  GetRendererStyleEditInfoResult,
  GetRendererStyleEntriesArgs,
  GetRendererStyleEntriesResult,
} from '../../server/services/rendererStyle.service'
import type {
  SetRendererSelectionArgs,
  SetRendererSelectionResult,
} from '../../server/services/setRendererSelection.service'

export interface RendCalls {
  getMaterialNames:           { args: GetMaterialNamesArgs; result: GetMaterialNamesResult }
  getSiblingRendererNames:    { args: GetSiblingRendererNamesArgs; result: GetSiblingRendererNamesResult }
  getRendererStyleEntries:    { args: GetRendererStyleEntriesArgs; result: GetRendererStyleEntriesResult }
  applyRendererStyle:         { args: ApplyRendererStyleArgs; result: ApplyRendererStyleResult }
  getRendererStyleEditInfo:   { args: GetRendererStyleEditInfoArgs; result: GetRendererStyleEditInfoResult }
  applyRendererStyleList:     { args: ApplyRendererStyleListArgs; result: ApplyRendererStyleListResult }
  getCreateRendStyleInfo:     { args: GetCreateRendStyleInfoArgs; result: GetCreateRendStyleInfoResult }
  createStyleFromRenderer:    { args: CreateStyleFromRendererArgs; result: CreateStyleFromRendererResult }
  setRendererSelection:       { args: SetRendererSelectionArgs; result: SetRendererSelectionResult }
  generateRendererSurfObj:    { args: GenerateRendererSurfObjArgs; result: GenerateRendererSurfObjResult }
  createRendererGroup:        { args: CreateRendererGroupArgs; result: CreateRendererGroupResult }
  changeRendererType:         { args: ChangeRendererTypeArgs; result: ChangeRendererTypeResult }
  getRendererChangeTypes:     { args: GetRendererChangeTypesArgs; result: GetRendererChangeTypesResult }
  createRendererOnObject:     { args: CreateRendererOnObjectArgs; result: CreateRendererOnObjectResult }
  getNewRendererOptions:      { args: GetNewRendererOptionsArgs; result: GetNewRendererOptionsResult }
  getRendPresetTypes:         { args: GetRendPresetTypesArgs; result: GetRendPresetTypesResult }
  listAtomIntrDefs:           { args: ListAtomIntrDefsArgs; result: ListAtomIntrDefsResult }
  removeAtomIntrDefs:         { args: RemoveAtomIntrDefsArgs; result: RemoveAtomIntrDefsResult }
}

export const REND_KEYS = [
  'getMaterialNames',
  'getSiblingRendererNames',
  'getRendererStyleEntries',
  'applyRendererStyle',
  'getRendererStyleEditInfo',
  'applyRendererStyleList',
  'getCreateRendStyleInfo',
  'createStyleFromRenderer',
  'setRendererSelection',
  'generateRendererSurfObj',
  'createRendererGroup',
  'changeRendererType',
  'getRendererChangeTypes',
  'createRendererOnObject',
  'getNewRendererOptions',
  'getRendPresetTypes',
  'listAtomIntrDefs',
  'removeAtomIntrDefs',
] as const satisfies readonly (keyof RendCalls)[]
