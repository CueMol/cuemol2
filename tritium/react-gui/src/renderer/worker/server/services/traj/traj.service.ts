/**
 * @file worker/server/services/traj/traj.service.ts
 * @description Trajectories: the registry entry.
 *
 * MD trajectories and morphs: loading a trajectory onto a molecule, reading
 * what its renderer reports, and building a morph between two states.
 */

import { getTrajectoryRendererInfo } from './getTrajectoryRendererInfo';
import { addMorphFrameFromFile, addMorphFrameFromMol, convertToMorphMol, getMorphFrames, removeMorphFrame } from './morphMol';
import { appendTrajectoryBlock, getTrajectoryState, moveTrajectoryBlock, removeTrajectoryBlock, setTrajectoryFrame } from './trajectory';

export const services = {
    getTrajectoryRendererInfo,
    convertToMorphMol,
    getMorphFrames,
    addMorphFrameFromFile,
    addMorphFrameFromMol,
    removeMorphFrame,
    getTrajectoryState,
    setTrajectoryFrame,
    appendTrajectoryBlock,
    removeTrajectoryBlock,
    moveTrajectoryBlock,
};

export type * from './getTrajectoryRendererInfo';
export type * from './morphMol';
export type * from './trajectory';
