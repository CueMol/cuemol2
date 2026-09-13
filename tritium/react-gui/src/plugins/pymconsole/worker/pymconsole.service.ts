/**
 * @file plugins/pymconsole/worker/pymconsole.service.ts
 * @description The PyMOL console's worker services: the registry entry.
 *
 * Found by the plugin glob in `worker/server/services/index.ts` and registered
 * under `plugin.pymconsole.<name>`, which is why this name is absent from
 * `ServiceMap`. The panel calls it through the typed client in `../calls.ts`.
 */

import { runCommand } from './runCommand'

export const services = {
    runCommand,
};

export type * from '../shared/consoleTypes';
