/**
 * @file components/dialogs/trajPathHistory.ts
 * @description localStorage-backed "last used path" for the MD trajectory
 * open dialog -- one entry for the topology file and one for the trajectory
 * files. Mirrors the psfPathHistory / coordPathHistory pattern so reopening
 * the dialog defaults to the directory the user last picked from.
 *
 * Built on the shared `createStringPref` factory (defensive reads, empty-set
 * ignored).
 */

import { createStringPref } from '../../utils/createStringPref';

export const TOPOLOGY_PATH_KEY = 'cuemol.fopenOptions.mdTrajTopologyPath';
export const TRAJ_PATH_KEY = 'cuemol.fopenOptions.mdTrajTrajPath';

const topoStore = createStringPref({ key: TOPOLOGY_PATH_KEY });
const trajStore = createStringPref({ key: TRAJ_PATH_KEY });

export const getLastTopologyPath = topoStore.get;
export const setLastTopologyPath = topoStore.set;
export const getLastTrajPath = trajStore.get;
export const setLastTrajPath = trajStore.set;
