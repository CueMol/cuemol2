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
} from '@renderer/worker/server/services/rend/atomIntrEdit'
import type {
  ChangeRendererTypeArgs,
  ChangeRendererTypeResult,
} from '@renderer/worker/server/services/rend/changeRendererType'
import type {
  CreateRendererGroupArgs,
  CreateRendererGroupResult,
} from '@renderer/worker/server/services/rend/createRendererGroup'
import type {
  CreateRendererOnObjectArgs,
  CreateRendererOnObjectResult,
} from '@renderer/worker/server/services/rend/createRendererOnObject'
import type {
  CreateStyleFromRendererArgs,
  CreateStyleFromRendererResult,
  GetCreateRendStyleInfoArgs,
  GetCreateRendStyleInfoResult,
} from '@renderer/worker/server/services/rend/createStyleFromRenderer'
import type {
  GenerateRendererSurfObjArgs,
  GenerateRendererSurfObjResult,
} from '@renderer/worker/server/services/rend/generateRendererSurfObj'
import type {
  GetMaterialNamesArgs,
  GetMaterialNamesResult,
} from '@renderer/worker/server/services/rend/getMaterialNames'
import type {
  GetNewRendererOptionsArgs,
  GetNewRendererOptionsResult,
  GetRendPresetTypesArgs,
  GetRendPresetTypesResult,
} from '@renderer/worker/server/services/rend/getNewRendererOptions'
import type {
  GetRendererChangeTypesArgs,
  GetRendererChangeTypesResult,
} from '@renderer/worker/server/services/rend/getRendererChangeTypes'
import type {
  GetSiblingRendererNamesArgs,
  GetSiblingRendererNamesResult,
} from '@renderer/worker/server/services/rend/getSiblingRendererNames'
import type {
  ApplyRendererStyleArgs,
  ApplyRendererStyleListArgs,
  ApplyRendererStyleListResult,
  ApplyRendererStyleResult,
  GetRendererStyleEditInfoArgs,
  GetRendererStyleEditInfoResult,
  GetRendererStyleEntriesArgs,
  GetRendererStyleEntriesResult,
} from '@renderer/worker/server/services/rend/rendererStyle'
import type {
  SetRendererSelectionArgs,
  SetRendererSelectionResult,
} from '@renderer/worker/server/services/rend/setRendererSelection'

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
