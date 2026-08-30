/**
 * @file worker/shared/calls/scene.ts
 * @description ServiceMap slice: scene lifecycle: creation, close/save/export, background colour.
 *
 * One row per registered worker service. `SCENE_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  CreateNewSceneAndViewArgs,
  CreateNewSceneAndViewResult,
} from '@renderer/worker/server/services/scene/createNewSceneAndView'
import type {
  CreateViewInSceneArgs,
  CreateViewInSceneResult,
} from '@renderer/worker/server/services/scene/createViewInScene'
import type {
  ExportSceneArgs,
  ExportSceneResult,
  GetAvailableSceneExportersResult,
  GetSceneExportInfoArgs,
  GetSceneExportInfoResult,
} from '@renderer/worker/server/services/scene/exportImage'
import type {
  GetSceneCloseInfoArgs,
  GetSceneCloseInfoResult,
} from '@renderer/worker/server/services/scene/getSceneCloseInfo'
import type {
  GetViewTabLabelArgs,
  GetViewTabLabelResult,
} from '@renderer/worker/server/services/scene/getViewTabLabel'
import type {
  IsSceneJustCreatedArgs,
  IsSceneJustCreatedResult,
} from '@renderer/worker/server/services/scene/isSceneJustCreated'
import type {
  ListSceneObjectsArgs,
  ListSceneObjectsResult,
} from '@renderer/worker/server/services/scene/listSceneObjects'
import type {
  ProposeNewTabNamesArgs,
  ProposeNewTabNamesResult,
} from '@renderer/worker/server/services/scene/proposeNewTabNames'
import type {
  ProposeUniqNameArgs,
  ProposeUniqNameResult,
} from '@renderer/worker/server/services/scene/proposeUniqName'
import type {
  GetSceneSaveInfoArgs,
  GetSceneSaveInfoResult,
  SaveSceneArgs,
  SaveSceneResult,
} from '@renderer/worker/server/services/scene/saveScene'
import type {
  SceneBgColorArgs,
  SceneBgColorResult,
  SceneColorProofingArgs,
  SceneColorProofingResult,
  SetSceneBgColorArgs,
} from '@renderer/worker/server/services/scene/sceneBgColor'

export interface SceneCalls {
  createNewSceneAndView:      { args: CreateNewSceneAndViewArgs; result: CreateNewSceneAndViewResult }
  createViewInScene:          { args: CreateViewInSceneArgs; result: CreateViewInSceneResult }
  getSceneCloseInfo:          { args: GetSceneCloseInfoArgs; result: GetSceneCloseInfoResult }
  isSceneJustCreated:         { args: IsSceneJustCreatedArgs; result: IsSceneJustCreatedResult }
  getViewTabLabel:            { args: GetViewTabLabelArgs; result: GetViewTabLabelResult }
  proposeNewTabNames:         { args: ProposeNewTabNamesArgs; result: ProposeNewTabNamesResult }
  proposeUniqName:            { args: ProposeUniqNameArgs; result: ProposeUniqNameResult }
  getSceneSaveInfo:           { args: GetSceneSaveInfoArgs; result: GetSceneSaveInfoResult }
  saveScene:                  { args: SaveSceneArgs; result: SaveSceneResult }
  exportScene:                { args: ExportSceneArgs; result: ExportSceneResult }
  getSceneExportInfo:         { args: GetSceneExportInfoArgs; result: GetSceneExportInfoResult }
  getAvailableSceneExporters: { args: void; result: GetAvailableSceneExportersResult }
  getSceneBgColor:            { args: SceneBgColorArgs; result: SceneBgColorResult }
  setSceneBgColor:            { args: SetSceneBgColorArgs; result: SceneBgColorResult }
  getSceneColorProofing:      { args: SceneColorProofingArgs; result: SceneColorProofingResult }
  toggleSceneColorProofing:   { args: SceneColorProofingArgs; result: SceneColorProofingResult }
  listSceneObjects:           { args: ListSceneObjectsArgs; result: ListSceneObjectsResult }
}

export const SCENE_KEYS = [
  'createNewSceneAndView',
  'createViewInScene',
  'getSceneCloseInfo',
  'isSceneJustCreated',
  'getViewTabLabel',
  'proposeNewTabNames',
  'proposeUniqName',
  'getSceneSaveInfo',
  'saveScene',
  'exportScene',
  'getSceneExportInfo',
  'getAvailableSceneExporters',
  'getSceneBgColor',
  'setSceneBgColor',
  'getSceneColorProofing',
  'toggleSceneColorProofing',
  'listSceneObjects',
] as const satisfies readonly (keyof SceneCalls)[]
