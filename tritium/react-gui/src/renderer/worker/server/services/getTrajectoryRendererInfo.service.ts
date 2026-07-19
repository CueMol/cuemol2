// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Returns the renderer types compatible with a Trajectory object, without
// loading any file. The MD trajectory dialog picks the initial renderer BEFORE
// the actual load (deferred-load flow, so a cancel loads nothing), so it cannot
// inspect a loaded object. Instead it queries a throwaway empty Trajectory whose
// compatible-renderer set depends only on the class (Trajectory : MolCoord).
//
// Mirrors the filtering in getCompatibleRendererNames.service.ts (drop internal
// '*' renderers and the ms2test/symm test types).
import type { WorkerContext } from '../types/WorkerContext';

const RENDERER_TEST_TYPES = new Set(['ms2test', 'symm']);

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
        .filter((s: string) => s.length > 0 && s.charAt(0) !== '*' && !RENDERER_TEST_TYPES.has(s));

    return { types, objClassName };
}

export const services = { getTrajectoryRendererInfo };
