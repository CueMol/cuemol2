/**
 * @file worker/shared/calls/style.ts
 * @description ServiceMap slice: style sets: create, destroy, load/save, edit contents.
 *
 * One row per registered worker service. `STYLE_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  LoadStyleSetFromFileArgs,
  LoadStyleSetFromFileResult,
  SaveStyleSetToCurrentSrcArgs,
  SaveStyleSetToCurrentSrcResult,
  SaveStyleSetToFileArgs,
  SaveStyleSetToFileResult,
} from '../../server/services/styleFile.service'
import type {
  CreateStyleSetArgs,
  CreateStyleSetResult,
  DestroyStyleSetArgs,
  DestroyStyleSetResult,
  ToggleStyleSetReadOnlyArgs,
  ToggleStyleSetReadOnlyResult,
} from '../../server/services/styleOps.service'
import type {
  GetStyleSetContentsArgs,
  GetStyleSetContentsResult,
  RemoveStyleSetKeyArgs,
  SetStyleSetColorArgs,
  SetStyleSetSelectionArgs,
  StyleSetEditResult,
} from '../../server/services/styleSetEdit.service'

export interface StyleCalls {
  createStyleSet:             { args: CreateStyleSetArgs; result: CreateStyleSetResult }
  destroyStyleSet:            { args: DestroyStyleSetArgs; result: DestroyStyleSetResult }
  toggleStyleSetReadOnly:     { args: ToggleStyleSetReadOnlyArgs; result: ToggleStyleSetReadOnlyResult }
  loadStyleSetFromFile:       { args: LoadStyleSetFromFileArgs; result: LoadStyleSetFromFileResult }
  saveStyleSetToFile:         { args: SaveStyleSetToFileArgs; result: SaveStyleSetToFileResult }
  saveStyleSetToCurrentSrc:   { args: SaveStyleSetToCurrentSrcArgs; result: SaveStyleSetToCurrentSrcResult }
  getStyleSetContents:        { args: GetStyleSetContentsArgs; result: GetStyleSetContentsResult }
  setStyleSetColor:           { args: SetStyleSetColorArgs; result: StyleSetEditResult }
  removeStyleSetColor:        { args: RemoveStyleSetKeyArgs; result: StyleSetEditResult }
  setStyleSetSelection:       { args: SetStyleSetSelectionArgs; result: StyleSetEditResult }
  removeStyleSetSelection:    { args: RemoveStyleSetKeyArgs; result: StyleSetEditResult }
  removeStyleSetStyle:        { args: RemoveStyleSetKeyArgs; result: StyleSetEditResult }
}

export const STYLE_KEYS = [
  'createStyleSet',
  'destroyStyleSet',
  'toggleStyleSetReadOnly',
  'loadStyleSetFromFile',
  'saveStyleSetToFile',
  'saveStyleSetToCurrentSrc',
  'getStyleSetContents',
  'setStyleSetColor',
  'removeStyleSetColor',
  'setStyleSetSelection',
  'removeStyleSetSelection',
  'removeStyleSetStyle',
] as const satisfies readonly (keyof StyleCalls)[]
