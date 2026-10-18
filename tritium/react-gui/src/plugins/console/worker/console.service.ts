/**
 * @file plugins/console/worker/console.service.ts
 * @description The console's worker services: the registry entry.
 *
 * Found by the plugin glob in `worker/server/services/index.ts` and registered
 * under `plugin.console.<name>`, which is why this name is absent from
 * `ServiceMap`. The panel calls it through the typed client in `../calls.ts`.
 */

import { complete } from './completion/completeService'
import { runCommand } from './runtime/runCommand'
import { cancelRun } from './runtime/runControl'

export const services = {
    runCommand,
    cancelRun,
    complete,
};

export type * from '../shared/consoleTypes';
