/**
 * @file worker/server/services/morph/morph.service.ts
 * @description Morphs: the registry entry.
 *
 * Building a morph between two molecular states and editing its frame list.
 * MD trajectories used to share this slice; they now live in the MD Tools
 * plugin (`plugins/mdtools/worker/`), which registers its own services.
 */

import { addMorphFrameFromFile, addMorphFrameFromMol, convertToMorphMol, getMorphFrames, removeMorphFrame } from './morphMol';

export const services = {
    convertToMorphMol,
    getMorphFrames,
    addMorphFrameFromFile,
    addMorphFrameFromMol,
    removeMorphFrame,
};

export type * from './morphMol';
