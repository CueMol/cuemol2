/**
 * @file plugins/console/worker/dialects/index.ts
 * @description The dialects the console can speak, by id.
 */

import { DEFAULT_DIALECT } from '../../shared/dialectMeta'
import type { DialectId } from '../../shared/dialectMeta'
import type { ConsoleDialect } from '../runtime/types'
import { NATIVE_DIALECT } from './native'
import { PYMOL_DIALECT } from './pymol'

/**
 * Every dialect's implementation, by id. Each has its row in
 * `shared/dialectMeta.ts` too; a dialect is added or removed in both places.
 */
const DIALECTS: Readonly<Record<DialectId, ConsoleDialect>> = {
  native: NATIVE_DIALECT,
  pymol: PYMOL_DIALECT,
}

/** The dialect with this id, or the default one for an id no dialect has. */
export function dialectOf(id: DialectId): ConsoleDialect {
  return DIALECTS[id] ?? DIALECTS[DEFAULT_DIALECT]
}
