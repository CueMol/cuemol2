/**
 * @file worker/shared/calls/actions.ts
 * @description ServiceMap slice: the action log (what each undo step ran)
 * and the Action library (presets and saved actions).
 *
 * One row per registered worker service. `ACTIONS_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  ExportActionStepsArgs,
  GetActionStepsArgs,
} from '@renderer/worker/server/services/actions/actions'
import type {
  CopyMacroToLibraryArgs,
  RenameLibraryFileArgs,
  RunLibraryEntryResult,
  SaveStepsToLibraryArgs,
} from '@renderer/worker/server/services/actions/library'
import type { ActionStepsArgs, ActionStepView } from '@renderer/worker/shared/actionTypes'
import type { LibraryFile, ListActionLibraryArgs, RunLibraryEntryArgs } from '@renderer/worker/shared/actionLibraryTypes'
import type { Result } from '@renderer/worker/shared/result'

export interface ActionsCalls {
  getActionSteps:             { args: GetActionStepsArgs; result: Result<{ steps: ActionStepView[] }> }
  exportActionSteps:          { args: ExportActionStepsArgs; result: Result<{ count: number }> }
  actionStepLines:            { args: ActionStepsArgs; result: Result<{ text: string }> }
  listActionLibrary:          { args: ListActionLibraryArgs; result: Result<{ files: LibraryFile[] }> }
  runLibraryEntry:            { args: RunLibraryEntryArgs; result: Result<RunLibraryEntryResult> }
  canSaveAsMacro:             { args: ActionStepsArgs; result: Result<object> }
  saveStepsToLibrary:         { args: SaveStepsToLibraryArgs; result: Result<{ file: string }> }
  copyMacroToLibrary:         { args: CopyMacroToLibraryArgs; result: Result<{ file: string }> }
  renameLibraryFile:          { args: RenameLibraryFileArgs; result: Result<{ file: string }> }
}

export const ACTIONS_KEYS = [
  'getActionSteps',
  'exportActionSteps',
  'actionStepLines',
  'listActionLibrary',
  'runLibraryEntry',
  'canSaveAsMacro',
  'saveStepsToLibrary',
  'copyMacroToLibrary',
  'renameLibraryFile',
] as const satisfies readonly (keyof ActionsCalls)[]
