/**
 * @file plugins/sequence/calls.ts
 * @description The Sequence plugin's renderer-to-worker call contract.
 *
 * The same `{ args; result }` shape a `ServiceMap` slice has, kept here
 * because a plugin cannot add rows to that closed map. `SEQ_KEYS` mirrors the
 * keys as a value so `plugins/index.test.ts` can check the contract against
 * the services the worker actually registers, exactly as
 * `worker/shared/calls/index.test.ts` does for the built-ins.
 */

import { definePluginServices } from '@renderer/plugin-host/api'
import type {
  GetSeqPanelDataArgs,
  GetSeqPanelDataResult,
} from './worker/getSeqPanelData'
import type {
  CenterOnResidueArgs,
  CenterOnResidueResult,
  RangeSelectResiduesArgs,
  RangeSelectResiduesResult,
  ToggleResidueSelectionArgs,
  ToggleResidueSelectionResult,
} from './worker/seqPanelOps'

export type SequenceCalls = {
  getSeqPanelData: { args: GetSeqPanelDataArgs; result: GetSeqPanelDataResult }
  toggleResidueSelection: {
    args: ToggleResidueSelectionArgs
    result: ToggleResidueSelectionResult
  }
  rangeSelectResidues: { args: RangeSelectResiduesArgs; result: RangeSelectResiduesResult }
  centerOnResidue: { args: CenterOnResidueArgs; result: CenterOnResidueResult }
}

export const SEQ_KEYS = [
  'getSeqPanelData',
  'toggleResidueSelection',
  'rangeSelectResidues',
  'centerOnResidue',
] as const satisfies readonly (keyof SequenceCalls)[]

/** Typed caller for the services this plugin registers. */
export const seqServices = definePluginServices<SequenceCalls>('sequence')
