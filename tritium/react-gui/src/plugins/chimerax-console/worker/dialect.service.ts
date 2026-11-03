/**
 * @file plugins/chimerax-console/worker/dialect.service.ts
 * @description Adds the ChimeraX dialect to the console when the worker loads.
 *
 * The worker loads every plugin's `worker/*.service.ts` at start; this one
 * offers no service of its own and is only the place that registration
 * happens. Whether the dialect may be used is the renderer's to say (the
 * plugin's switch): the worker holds it either way.
 */

import { registerDialect } from '@plugins/console/worker/dialect-api'
import { CHIMERAX_DIALECT } from './index'

registerDialect(CHIMERAX_DIALECT)

export const services = {}
