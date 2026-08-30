/**
 * @file worker/shared/calls/traj.ts
 * @description ServiceMap slice: MD trajectories and morphing.
 *
 * One row per registered worker service. `TRAJ_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  GetTrajectoryRendererInfoResult,
} from '@renderer/worker/server/services/traj/getTrajectoryRendererInfo'
import type {
  AddMorphFrameFromFileArgs,
  AddMorphFrameFromMolArgs,
  ConvertToMorphMolArgs,
  ConvertToMorphMolResult,
  GetMorphFramesArgs,
  GetMorphFramesResult,
  MorphFrameEditResult,
  RemoveMorphFrameArgs,
} from '@renderer/worker/server/services/traj/morphMol'
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
} from '@renderer/worker/server/services/traj/trajectory'

export interface TrajCalls {
  getTrajectoryRendererInfo:  { args: Record<string, never>; result: GetTrajectoryRendererInfoResult }
  getTrajectoryState:         { args: GetTrajectoryStateArgs; result: TrajectoryState }
  setTrajectoryFrame:         { args: SetTrajectoryFrameArgs; result: SetTrajectoryFrameResult }
  appendTrajectoryBlock:      { args: AppendTrajectoryBlockArgs; result: AppendTrajectoryBlockResult }
  removeTrajectoryBlock:      { args: RemoveTrajectoryBlockArgs; result: TrajBlockEditResult }
  moveTrajectoryBlock:        { args: MoveTrajectoryBlockArgs; result: TrajBlockEditResult }
  convertToMorphMol:          { args: ConvertToMorphMolArgs; result: ConvertToMorphMolResult }
  getMorphFrames:             { args: GetMorphFramesArgs; result: GetMorphFramesResult }
  addMorphFrameFromFile:      { args: AddMorphFrameFromFileArgs; result: MorphFrameEditResult }
  addMorphFrameFromMol:       { args: AddMorphFrameFromMolArgs; result: MorphFrameEditResult }
  removeMorphFrame:           { args: RemoveMorphFrameArgs; result: MorphFrameEditResult }
}

export const TRAJ_KEYS = [
  'getTrajectoryRendererInfo',
  'getTrajectoryState',
  'setTrajectoryFrame',
  'appendTrajectoryBlock',
  'removeTrajectoryBlock',
  'moveTrajectoryBlock',
  'convertToMorphMol',
  'getMorphFrames',
  'addMorphFrameFromFile',
  'addMorphFrameFromMol',
  'removeMorphFrame',
] as const satisfies readonly (keyof TrajCalls)[]
