/**
 * @file components/multigrad/multiGradPresets.ts
 * @description Re-export of the gradient presets, which live on the worker
 * boundary: the coloring service builds preset nodes too, and importing them
 * from here made the WORKER bundle pull in a components/ module.
 */

export {
    MULTIGRAD_PRESETS,
    buildPresetNodes,
} from '@renderer/worker/shared/multiGradPresets';
export type {
    MultiGradPresetId,
    MapStats,
    GradNode,
} from '@renderer/worker/shared/multiGradPresets';
