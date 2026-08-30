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
} from '@renderer/worker/server/services/file/getCompatibleRendererNames'
import type {
  GetMtzColumnInfoArgs,
  GetMtzColumnInfoResult,
} from '@renderer/worker/server/services/map/map.service'
import type { GetOpenFiltersArgs } from '@renderer/worker/server/services/file/getOpenFilters'
import type {
  GetReaderDefaultOptionsArgs,
  GetReaderDefaultOptionsResult,
} from '@renderer/worker/server/services/file/getReaderDefaultOptions'
import type { LoadObjectArgs, LoadObjectResult } from '@renderer/worker/server/services/file/loadObject'
import type {
  LoadSceneArgs,
  LoadSceneResult,
  OpenSceneFileArgs,
  OpenSceneFileResult,
} from '@renderer/worker/server/services/file/loadScene'
import type {
  LoadTrajectoryArgs,
  LoadTrajectoryResult,
} from '@renderer/worker/server/services/file/loadTrajectory'
import type {
  GetObjectSaveInfoArgs,
  GetObjectSaveInfoResult,
  ListSavableObjectsArgs,
  ListSavableObjectsResult,
  SaveObjectToFileArgs,
  SaveObjectToFileResult,
} from '@renderer/worker/server/services/file/objectSave'
import type {
  ProbeMapHeaderArgs,
  ProbeMapHeaderResult,
} from '@renderer/worker/server/services/map/map.service'
import type {
  StreamLoadDensityMapArgs,
  StreamLoadDensityMapResult,
} from '@renderer/worker/server/services/map/map.service'
import type {
  CancelStreamLoadArgs,
  CancelStreamLoadResult,
  StreamLoadFromUrlArgs,
  StreamLoadFromUrlResult,
} from '@renderer/worker/server/services/file/streamLoadFromUrl'

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
