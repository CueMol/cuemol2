/**
 * @file plugins/agent/worker/agent.service.ts
 * @description The plugin's worker services, as the registry finds them.
 *
 * The glob in `worker/server/services/index.ts` picks this file up by its
 * name and registers each entry of `services` under `plugin.agent.<name>`.
 * The prefix is applied there, so the names below stay bare.
 */

import { cancelTurn, runTurn } from './turnLoop'

export const services = { runTurn, cancelTurn }

export type * from '../shared/agentTypes'
