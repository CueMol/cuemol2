/**
 * @file worker/server/services/helpers/molAnlTool.ts
 * @description Shared preamble for the single-object MolAnlManager tool
 * services (Change chain ID / Delete atoms / Change residue index).
 *
 * These three services share a near-identical 4-step resolution:
 *   scene -> molecule object -> compiled selection -> MolAnlManager.
 * Each step has a distinct `{ ok: false, error }` failure. This helper
 * centralises that resolution so each service keeps only its own undo-txn
 * mutation body at the call site.
 *
 * @remarks Intentionally NOT used by the multi-object MolAnl services
 * (mergeMol / superposeMol / reassignProt2ndry): those resolve two objects,
 * optional selections, or bespoke txn rollback and do not share this shape.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../../types/WorkerContext';
import { getSceneOrNull } from './sceneResolver';
import { makeSel } from './makeSel';

/**
 * Resolve the global `MolAnlManager` service, or `null` when unavailable.
 *
 * @param ctx - worker context
 * @returns the MolAnlManager wrapper, or `null`
 */
export function getMolAnlMgrOrNull(ctx: WorkerContext): MolAnlManager | null {
    return (ctx.svc.getService('MolAnlManager') as MolAnlManager | null) ?? null;
}

/** Successful resolution of a single-object MolAnl tool's inputs. */
export interface MolToolTarget {
    scene: Scene;
    mol: CueMolObject;
    sel: MolSelection;
    mgr: MolAnlManager;
}

/**
 * Resolve the shared inputs of a single-object MolAnlManager tool service:
 * the scene, the target molecule object, the compiled selection, and the
 * MolAnlManager. Returns either the resolved target or the first failing
 * step's `{ ok: false, error }` result (byte-identical to the previous inline
 * preamble in each service).
 *
 * @param ctx - worker context
 * @param sceneId - scene uid scope
 * @param objId - target MolCoord object uid
 * @param selStr - atom-selection expression (empty / "*" selects all)
 * @returns the resolved {@link MolToolTarget}, or `{ ok: false, error }`
 */
export function resolveMolTool(
    ctx: WorkerContext,
    sceneId: number,
    objId: number,
    selStr: string,
): MolToolTarget | { ok: false; error: string } {
    const scene = getSceneOrNull(ctx, sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const mol = scene.getObject(objId) as CueMolObject | null;
    if (!mol) return { ok: false, error: 'molecule not found' };

    const sel = makeSel(ctx, selStr, scene.uid);
    if (!sel) return { ok: false, error: 'invalid selection' };

    const mgr = getMolAnlMgrOrNull(ctx);
    if (!mgr) return { ok: false, error: 'MolAnlManager unavailable' };

    return { scene, mol, sel: sel as unknown as MolSelection, mgr };
}
