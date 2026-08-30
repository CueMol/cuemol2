/**
 * @file worker/shared/calls/color.ts
 * @description ServiceMap slice: colour compilation and the named-colour palette.
 *
 * One row per registered worker service. `COLOR_KEYS` lists the same keys
 * as a value, so `calls/index.test.ts` can check the slices against the
 * services the worker actually registers.
 */

import type {
  CompileColorArgs,
  CompileColorResult,
  GetNamedColorsArgs,
  GetNamedColorsResult,
} from '@renderer/worker/server/services/colorPicker.service'

export interface ColorCalls {
  compileColor:               { args: CompileColorArgs; result: CompileColorResult }
  getNamedColors:             { args: GetNamedColorsArgs; result: GetNamedColorsResult }
}

export const COLOR_KEYS = [
  'compileColor',
  'getNamedColors',
] as const satisfies readonly (keyof ColorCalls)[]
