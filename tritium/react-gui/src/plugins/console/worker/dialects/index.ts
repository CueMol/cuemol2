/**
 * @file plugins/console/worker/dialects/index.ts
 * @description The dialect a call is in, by id.
 *
 * Native is the console's own. Any other is added by a plugin of its own
 * (`pymol-console`, `chimerax-console`), whose worker module registers it
 * when the worker loads plugin modules (`registry.ts`, reached through
 * `dialect-api.ts`). The worker does not know which plugins are switched
 * on: it holds every registered dialect, and the renderer only sends the
 * ids of switched-on ones (the panel's switch, and the endpoint's check).
 */

import type { DialectId } from '../../shared/dialectMeta'
import type { ConsoleDialect } from '../runtime/types'
import { NATIVE_DIALECT } from './native'
import { registeredDialect } from './registry'

export { registeredMetas, registerDialect } from './registry'

/** The dialect with this id, or native for an id no dialect has. */
export function dialectOf(id: DialectId): ConsoleDialect {
  return registeredDialect(id) ?? NATIVE_DIALECT
}
