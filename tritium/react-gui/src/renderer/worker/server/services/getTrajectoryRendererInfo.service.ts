// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Returns the renderer types compatible with a Trajectory object, without
// loading any file. The MD trajectory dialog picks the initial renderer BEFORE
// the actual load (deferred-load flow, so a cancel loads nothing), so it cannot
// inspect a loaded object. Instead it queries a throwaway empty Trajectory whose
// compatible-renderer set depends only on the class (Trajectory : MolCoord).
//
// Filters the list the same way every other create-side list does, through
// helpers/rendererFilter.
import type { WorkerContext } from '../types/WorkerContext';
import { isInitialRendererType } from './helpers/rendererFilter';


export interface GetTrajectoryRendererInfoResult {
    types: string[];
    /** C++ class name of the probe object (expected 'Trajectory'). */
    objClassName: string;
}

interface TrajProbe {
    getClassName?: () => string;
    searchCompatibleRendererNames: () => string;
}

function getTrajectoryRendererInfo(
    ctx: WorkerContext,
    _args: Record<string, never>,
): GetTrajectoryRendererInfoResult {
    const tmp = ctx.svc.createObj('Trajectory') as unknown as TrajProbe | null;
    if (!tmp) return { types: [], objClassName: '' };

    const objClassName = tmp.getClassName?.() ?? 'Trajectory';
    const rendTypesStr = tmp.searchCompatibleRendererNames();
    const types = (rendTypesStr ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(isInitialRendererType);

    return { types, objClassName };
}

export const services = { getTrajectoryRendererInfo };
