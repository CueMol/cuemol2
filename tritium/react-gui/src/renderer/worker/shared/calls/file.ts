/**
 * @file worker/shared/calls/file.ts
 * @description ServiceMap slice: reading files and URLs into a scene, and writing objects back out.
 *
 * One row per registered worker service. `FILE_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type { ElectronFileFilter } from '@shared/types/fileDialog'
import type {
  GetCompatibleRendererNamesArgs,
  GetCompatibleRendererNamesResult,
} from '../../server/services/getCompatibleRendererNames.service'
import type {
  GetMtzColumnInfoArgs,
  GetMtzColumnInfoResult,
} from '../../server/services/getMtzColumnInfo.service'
import type { GetOpenFiltersArgs } from '../../server/services/getOpenFilters.service'
import type {
  GetReaderDefaultOptionsArgs,
  GetReaderDefaultOptionsResult,
} from '../../server/services/getReaderDefaultOptions.service'
import type { LoadObjectArgs, LoadObjectResult } from '../../server/services/loadObject.service'
import type {
  LoadSceneArgs,
  LoadSceneResult,
  OpenSceneFileArgs,
  OpenSceneFileResult,
} from '../../server/services/loadScene.service'
import type {
  LoadTrajectoryArgs,
  LoadTrajectoryResult,
} from '../../server/services/loadTrajectory.service'
import type {
  GetObjectSaveInfoArgs,
  GetObjectSaveInfoResult,
  ListSavableObjectsArgs,
  ListSavableObjectsResult,
  SaveObjectToFileArgs,
  SaveObjectToFileResult,
} from '../../server/services/objectSave.service'
import type {
  ProbeMapHeaderArgs,
  ProbeMapHeaderResult,
} from '../../server/services/probeMapHeader.service'
import type {
  StreamLoadDensityMapArgs,
  StreamLoadDensityMapResult,
} from '../../server/services/streamLoadDensityMap.service'
import type {
  CancelStreamLoadArgs,
  CancelStreamLoadResult,
  StreamLoadFromUrlArgs,
  StreamLoadFromUrlResult,
} from '../../server/services/streamLoadFromUrl.service'

export interface FileCalls {
  getCompatibleRendererNames: { args: GetCompatibleRendererNamesArgs; result: GetCompatibleRendererNamesResult }
  getMtzColumnInfo:           { args: GetMtzColumnInfoArgs; result: GetMtzColumnInfoResult }
  getReaderDefaultOptions:    { args: GetReaderDefaultOptionsArgs; result: GetReaderDefaultOptionsResult }
  probeMapHeader:             { args: ProbeMapHeaderArgs; result: ProbeMapHeaderResult }
  getOpenFilters:             { args: GetOpenFiltersArgs; result: ElectronFileFilter[] }
  loadObject:                 { args: LoadObjectArgs; result: LoadObjectResult }
  loadTrajectory:             { args: LoadTrajectoryArgs; result: LoadTrajectoryResult }
  loadScene:                  { args: LoadSceneArgs; result: LoadSceneResult }
  openSceneFile:              { args: OpenSceneFileArgs; result: OpenSceneFileResult }
  streamLoadFromUrl:          { args: StreamLoadFromUrlArgs; result: StreamLoadFromUrlResult }
  streamLoadDensityMap:       { args: StreamLoadDensityMapArgs; result: StreamLoadDensityMapResult }
  cancelStreamLoad:           { args: CancelStreamLoadArgs; result: CancelStreamLoadResult }
  getObjectSaveInfo:          { args: GetObjectSaveInfoArgs; result: GetObjectSaveInfoResult }
  saveObjectToFile:           { args: SaveObjectToFileArgs; result: SaveObjectToFileResult }
  listSavableObjects:         { args: ListSavableObjectsArgs; result: ListSavableObjectsResult }
}

export const FILE_KEYS = [
  'getCompatibleRendererNames',
  'getMtzColumnInfo',
  'getReaderDefaultOptions',
  'probeMapHeader',
  'getOpenFilters',
  'loadObject',
  'loadTrajectory',
  'loadScene',
  'openSceneFile',
  'streamLoadFromUrl',
  'streamLoadDensityMap',
  'cancelStreamLoad',
  'getObjectSaveInfo',
  'saveObjectToFile',
  'listSavableObjects',
] as const satisfies readonly (keyof FileCalls)[]
