/**
 * @file worker/shared/calls/undo.ts
 * @description ServiceMap slice: undo / redo of the active scene.
 *
 * One row per registered worker service. `UNDO_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type { RedoArgs } from '../../server/services/redo.service'
import type {
  ClearUndoDataArgs,
  GetUndoStateArgs,
  UndoArgs,
  UndoState,
} from '../../server/services/undo.service'

export interface UndoCalls {
  redo:                       { args: RedoArgs; result: { ok: boolean } }
  undo:                       { args: UndoArgs; result: { ok: boolean } }
  getUndoState:               { args: GetUndoStateArgs; result: UndoState }
  clearUndoData:              { args: ClearUndoDataArgs; result: { ok: boolean } }
}

export const UNDO_KEYS = [
  'redo',
  'undo',
  'getUndoState',
  'clearUndoData',
] as const satisfies readonly (keyof UndoCalls)[]
