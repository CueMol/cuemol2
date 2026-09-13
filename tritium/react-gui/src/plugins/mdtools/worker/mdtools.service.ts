/**
 * @file plugins/mdtools/worker/mdtools.service.ts
 * @description The MD Tools plugin's worker services: the registry entry.
 *
 * Found by the plugin glob in `worker/server/services/index.ts` and registered
 * under `plugin.mdtools.<name>`, which is why these names are absent from
 * `ServiceMap`. The renderer half calls them through the typed client in
 * `../calls.ts`.
 *
 * The C++ side (src/modules/mdtools) is always loaded, so these services keep
 * working whether or not the plugin is enabled -- only the UI that reaches
 * them disappears.
 */

import { getTrajectoryRendererInfo } from './getTrajectoryRendererInfo';
import { loadTrajectory } from './loadTrajectory';
import {
    appendTrajectoryBlock,
    getTrajectoryState,
    moveTrajectoryBlock,
    removeTrajectoryBlock,
    setTrajectoryFrame,
} from './trajectory';

export const services = {
    loadTrajectory,
    getTrajectoryRendererInfo,
    getTrajectoryState,
    setTrajectoryFrame,
    appendTrajectoryBlock,
    removeTrajectoryBlock,
    moveTrajectoryBlock,
};

export type * from './getTrajectoryRendererInfo';
export type * from './loadTrajectory';
export type * from './trajectory';
