/**
 * @file plugins/console/worker/dialects/index.ts
 * @description The dialects the console can speak, by id.
 */

import type { ConsoleDialect, DialectId } from '../runtime/types'
import { PYMOL_DIALECT } from './pymol'

const DIALECTS: Readonly<Record<DialectId, ConsoleDialect>> = {
  pymol: PYMOL_DIALECT,
  native: PYMOL_DIALECT,
}

/** The dialect with this id. */
export function dialectOf(id: DialectId): ConsoleDialect {
  return DIALECTS[id] ?? PYMOL_DIALECT
}
