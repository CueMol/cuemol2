/**
 * @file worker/shared/hitTest.ts
 * @description Result of a viewport hit test.
 *
 * Produced by the worker's navi services and consumed by the renderer's
 * context-menu / click handlers, so it belongs on the boundary rather than in
 * renderer/types.ts.
 */

export interface HitTestResult {
    objtype: string;
    obj_id: number;
    obj_name: string;
    rend_id: number;
    rend_name: string;
    rendtype: string;
    atom_id: number;
    sel: string;
    message: string;
    x: number;
    y: number;
    z: number;
    occ: number;
    bfac: number;
    symm_id?: number;
    symm_name?: string;
}
