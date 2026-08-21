/**
 * @file services/createSymmMol.service.ts
 * @description Worker services backing the 3D-view "Create SYMM mol..."
 * context-menu action. Ports UXP `navi-toolribbon.js` `createSymmObj`:
 * materialize the clicked symmetry image of a molecule as a new MolCoord
 * (`copyAtoms` of all atoms + `xformByMat` with the symop matrix from the
 * hit `*symm` renderer), then attach the renderer picked in the shared
 * NewRendererDialog.
 *
 * `getCreateSymmMolOptions` pre-fetches the dialog data: renderer types /
 * presets via the shared `getNewRendererOptions` resolver, plus a unique
 * `"<mol name> <symop name>"` object-name suggestion (UXP builds the same
 * default from `mol.name + " " + res.symm_name`). `createSymmMol` performs
 * the creation inside a single 'Create symm mol' undo txn; renderer
 * attachment is delegated to `setupRenderer`, which also applies the
 * default paint coloring via `molPostProc` (UXP `createDefPaintColoring`).
 *
 * Unlike UXP, the symop matrix is read at commit time (after the dialog),
 * not at right-click time -- wrapper objects cannot round-trip through the
 * renderer thread. The `symm_id` stays valid while the `*symm` renderer's
 * operator table is unchanged, which holds in the UXP-equivalent flow too.
 */
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { Matrix } from '@cuemol/core/src/wrappers/Matrix';
import type { SymmRenderer } from '@cuemol/core/src/wrappers/SymmRenderer';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import type { PresetTypeEntry, RendererOptions } from '../../../components/fopen-opt-dlgs/types';
import { getNewRendererOptions } from './getNewRendererOptions.service';
import { setupRenderer } from './setupRenderer.service';
import { getViewSceneObjOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { uniqName } from './helpers/uniqName';
import { withUndoTxn } from './withUndoTxn';

export interface GetCreateSymmMolOptionsArgs {
    viewId: number;
    /** Source MolCoord uid (the molecule the `*symm` renderer belongs to). */
    objId: number;
    /** Symmetry-operator name from the hit-test result (`symm_name`). */
    symmName: string;
}

export interface GetCreateSymmMolOptionsResult {
    ok: boolean;
    /** Scene uid resolved from the view (the renderer side only has viewId). */
    sceneId: number;
    /** Suggested unique name for the new symm-copy object. */
    objName: string;
    /** Source molecule's C++ class name (renderer-type history key). */
    objClassName: string;
    rendererTypes: string[];
    presetTypes: PresetTypeEntry[];
    /** Suggested initial renderer name. */
    defaultRendName: string;
}

const OPTIONS_EMPTY: GetCreateSymmMolOptionsResult = {
    ok: false,
    sceneId: -1,
    objName: '',
    objClassName: '',
    rendererTypes: [],
    presetTypes: [],
    defaultRendName: '',
};

function getCreateSymmMolOptions(
    ctx: WorkerContext,
    args: GetCreateSymmMolOptionsArgs,
): GetCreateSymmMolOptionsResult {
    const vsm = getViewSceneObjOrNull(ctx, args.viewId, args.objId);
    if (!vsm) return OPTIONS_EMPTY;
    const { scene } = vsm;

    const opts = getNewRendererOptions(ctx, {
        sceneId: scene.uid,
        sourceNodeId: args.objId,
        sourceNodeType: 'object',
    });
    if (!opts.ok) return OPTIONS_EMPTY;

    // UXP default: `mol.name + " " + res.symm_name`, made unique the same
    // way the UXP dialog does on OK (`util.makeUniqName2` parens suffix).
    const base = `${opts.objName} ${args.symmName}`.trim();
    const objName = uniqName(base, (n) => !!scene.getObjectByName(n));

    return {
        ok: true,
        sceneId: scene.uid,
        objName,
        objClassName: opts.objClassName,
        rendererTypes: opts.rendererTypes,
        presetTypes: opts.presetTypes,
        defaultRendName: opts.defaultName,
    };
}

export interface CreateSymmMolArgs {
    viewId: number;
    /** Source MolCoord uid. */
    objId: number;
    /** Uid of the hit `*symm` renderer. */
    rendId: number;
    /** Symmetry-operator index from the hit-test result (`symm_id`). */
    symmId: number;
    /** Name for the new object (the dialog's edited object-name field). */
    objName: string;
    rendOpts: RendererOptions;
}

export interface CreateSymmMolResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
    /** UID of the new MolCoord on success. */
    newObjId?: number;
    newObjName?: string;
}

function createSymmMol(
    ctx: WorkerContext,
    args: CreateSymmMolArgs,
): CreateSymmMolResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false, error: 'molecule not found' };
    const { scene, obj: mol } = vsm;

    const rend = scene.getRenderer(args.rendId) as SymmRenderer | null;
    if (!rend) return { ok: false, error: 'symm renderer not found' };

    const objName = args.objName.trim();
    if (!objName) return { ok: false, error: 'empty object name' };

    const sel = makeSel(ctx, '*', scene.uid);
    if (!sel) return { ok: false, error: 'selection compile failed' };

    let matrix: Matrix;
    try {
        matrix = rend.getXformMatrix(args.symmId);
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    let newObjId = -1;

    // Roll back the whole txn on any failure (UXP wraps only addObject +
    // renderer setup, but mutations on the not-yet-added object generate no
    // undo records, so covering the whole sequence is observably identical).
    try {
        withUndoTxn(scene, 'Create symm mol', () => {
            const newMol = ctx.svc.createObj('MolCoord') as MolCoord;
            (newMol as unknown as { name: string }).name = objName;
            if (!newMol.copyAtoms(mol, sel as unknown as MolSelection)) {
                throw new Error('copyAtoms failed');
            }
            newMol.xformByMat(matrix, sel as unknown as MolSelection);
            scene.addObject(newMol as unknown as CueMolObject);
            newObjId = (newMol as unknown as { uid: number }).uid ?? -1;
            if (!setupRenderer(ctx, newMol, args.rendOpts)) {
                throw new Error('renderer creation failed');
            }
        });
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    if (newObjId < 0) return { ok: false, error: 'object creation failed' };
    return { ok: true, newObjId, newObjName: objName };
}

export const services = {
    getCreateSymmMolOptions,
    createSymmMol,
};
