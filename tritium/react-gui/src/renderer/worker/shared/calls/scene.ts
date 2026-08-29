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
} from '../../server/services/createNewSceneAndView.service'
import type {
  CreateViewInSceneArgs,
  CreateViewInSceneResult,
} from '../../server/services/createViewInScene.service'
import type {
  ExportSceneArgs,
  ExportSceneResult,
  GetAvailableSceneExportersResult,
  GetSceneExportInfoArgs,
  GetSceneExportInfoResult,
} from '../../server/services/exportImage.service'
import type {
  GetSceneCloseInfoArgs,
  GetSceneCloseInfoResult,
} from '../../server/services/getSceneCloseInfo.service'
import type {
  GetViewTabLabelArgs,
  GetViewTabLabelResult,
} from '../../server/services/getViewTabLabel.service'
import type {
  IsSceneJustCreatedArgs,
  IsSceneJustCreatedResult,
} from '../../server/services/isSceneJustCreated.service'
import type {
  ListSceneObjectsArgs,
  ListSceneObjectsResult,
} from '../../server/services/listSceneObjects.service'
import type {
  ProposeNewTabNamesArgs,
  ProposeNewTabNamesResult,
} from '../../server/services/proposeNewTabNames.service'
import type {
  ProposeUniqNameArgs,
  ProposeUniqNameResult,
} from '../../server/services/proposeUniqName.service'
import type {
  GetSceneSaveInfoArgs,
  GetSceneSaveInfoResult,
  SaveSceneArgs,
  SaveSceneResult,
} from '../../server/services/saveScene.service'
import type {
  SceneBgColorArgs,
  SceneBgColorResult,
  SceneColorProofingArgs,
  SceneColorProofingResult,
  SetSceneBgColorArgs,
} from '../../server/services/sceneBgColor.service'

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
