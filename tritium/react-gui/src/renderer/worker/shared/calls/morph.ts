/**
 * @file worker/shared/calls/morph.ts
 * @description ServiceMap slice: morphing between molecular states.
 *
 * One row per registered worker service. `MORPH_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 *
 * MD trajectory services used to share this slice; they moved to the MD Tools
 * plugin, whose contract is `plugins/mdtools/calls.ts`.
 */

import type {
  AddMorphFrameFromFileArgs,
  AddMorphFrameFromMolArgs,
  ConvertToMorphMolArgs,
  ConvertToMorphMolResult,
  GetMorphFramesArgs,
  GetMorphFramesResult,
  MorphFrameEditResult,
  RemoveMorphFrameArgs,
} from '@renderer/worker/server/services/morph/morphMol'

export interface MorphCalls {
  convertToMorphMol:          { args: ConvertToMorphMolArgs; result: ConvertToMorphMolResult }
  getMorphFrames:             { args: GetMorphFramesArgs; result: GetMorphFramesResult }
  addMorphFrameFromFile:      { args: AddMorphFrameFromFileArgs; result: MorphFrameEditResult }
  addMorphFrameFromMol:       { args: AddMorphFrameFromMolArgs; result: MorphFrameEditResult }
  removeMorphFrame:           { args: RemoveMorphFrameArgs; result: MorphFrameEditResult }
}

export const MORPH_KEYS = [
  'convertToMorphMol',
  'getMorphFrames',
  'addMorphFrameFromFile',
  'addMorphFrameFromMol',
  'removeMorphFrame',
] as const satisfies readonly (keyof MorphCalls)[]
