/**
 * @file plugins/console/worker/dialects/registry.ts
 * @description The dialects plugins have registered with the console's worker.
 *
 * Kept apart from `index.ts` (which adds native) so that what only needs the
 * metas -- the log's sources, a script's owner -- does not import the native
 * dialect, whose modules import the log in turn.
 */

import { NATIVE_META } from '../../shared/dialectMeta'
import type { DialectId, DialectMeta } from '../../shared/dialectMeta'
import type { ConsoleDialect } from '../runtime/types'

/** The dialects plugins registered, by id. */
const REGISTERED = new Map<DialectId, ConsoleDialect>()

/**
 * Add a dialect, keyed by its meta's id. A second registration under the
 * same id replaces the first (a module loaded again in development). Native
 * is the console's own and cannot be replaced.
 */
export function registerDialect(dialect: ConsoleDialect): void {
  if (dialect.meta.id === NATIVE_META.id) return
  REGISTERED.set(dialect.meta.id, dialect)
}

/** The registered dialect with this id, or undefined. */
export function registeredDialect(id: DialectId): ConsoleDialect | undefined {
  return REGISTERED.get(id)
}

/** What native and every registered dialect say about themselves (script owners, log sources). */
export function registeredMetas(): DialectMeta[] {
  return [NATIVE_META, ...[...REGISTERED.values()].map((d) => d.meta)]
}
