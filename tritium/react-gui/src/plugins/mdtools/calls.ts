/**
 * @file plugins/mdtools/calls.ts
 * @description The MD Tools plugin's renderer-to-worker call contract.
 *
 * The same `{ args; result }` shape a `ServiceMap` slice has, kept here
 * because a plugin cannot add rows to that closed map. `MDTOOLS_KEYS` mirrors
 * the keys as a value so `plugins/index.test.ts` can check the contract
 * against the services the worker actually registers, exactly as
 * `worker/shared/calls/index.test.ts` does for the built-ins.
 */

import { definePluginServices } from '@renderer/plugin-host/api'
import type { GetTrajectoryRendererInfoResult } from './worker/getTrajectoryRendererInfo'
import type { LoadTrajectoryArgs, LoadTrajectoryResult } from './worker/loadTrajectory'
import type {
  AppendTrajectoryBlockArgs,
  AppendTrajectoryBlockResult,
  GetTrajectoryStateArgs,
  MoveTrajectoryBlockArgs,
  RemoveTrajectoryBlockArgs,
  SetTrajectoryFrameArgs,
  SetTrajectoryFrameResult,
  TrajBlockEditResult,
  TrajectoryState,
} from './worker/trajectory'

// `type`, not `interface`: the plugin service client needs the implicit index
// signature an interface does not have.
export type MdtoolsCalls = {
  loadTrajectory: { args: LoadTrajectoryArgs; result: LoadTrajectoryResult }
  getTrajectoryRendererInfo: {
    args: Record<string, never>
    result: GetTrajectoryRendererInfoResult
  }
  getTrajectoryState: { args: GetTrajectoryStateArgs; result: TrajectoryState }
  setTrajectoryFrame: { args: SetTrajectoryFrameArgs; result: SetTrajectoryFrameResult }
  appendTrajectoryBlock: {
    args: AppendTrajectoryBlockArgs
    result: AppendTrajectoryBlockResult
  }
  removeTrajectoryBlock: { args: RemoveTrajectoryBlockArgs; result: TrajBlockEditResult }
  moveTrajectoryBlock: { args: MoveTrajectoryBlockArgs; result: TrajBlockEditResult }
}

export const MDTOOLS_KEYS = [
  'loadTrajectory',
  'getTrajectoryRendererInfo',
  'getTrajectoryState',
  'setTrajectoryFrame',
  'appendTrajectoryBlock',
  'removeTrajectoryBlock',
  'moveTrajectoryBlock',
] as const satisfies readonly (keyof MdtoolsCalls)[]

/** Typed caller for the services this plugin registers. */
export const mdtoolsServices = definePluginServices<MdtoolsCalls>('mdtools')
