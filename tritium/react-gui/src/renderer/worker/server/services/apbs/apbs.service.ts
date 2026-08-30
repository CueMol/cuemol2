/**
 * @file worker/server/services/apbs/apbs.service.ts
 * @description Electrostatic potential via APBS: the registry entry.
 *
 * Two external programs run per job -- pdb2pqr assigns charges and radii,
 * apbs solves on the grid -- and each is a `ProcessManager` task that
 * outlives the call that started it. So the service starts a job and returns;
 * a poll timer reports progress and brings the result map into the scene at
 * the end. This mirrors the two-phase render pipeline in `renderjob/`.
 */

import { calcApbsStart, calcApbsCancel } from './run';
import { proposeElepotName } from './naming';
export const services = { calcApbsStart, calcApbsCancel, proposeElepotName };

// Called on shutdown rather than by the renderer: the two child processes
// are spawned by this app and outlive it unless they are killed.
export { cancelAllApbsJobs } from './run';

export type * from './types';
