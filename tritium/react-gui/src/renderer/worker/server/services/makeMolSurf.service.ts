/**
 * @file services/makeMolSurf.service.ts
 * @description Worker service backing the "Mol surface generation" tool dialog
 * (`dialog.tool.makesurf`). Ports UXP `tools/makesurf.js`
 * (`gDlgObj.buildMolSurf`):
 *   - Compile the optional atom selection against the target molecule.
 *   - Create a `MolSurfObj`, build a solvent-excluded surface from the
 *     molecule (`createSESFromMol(mol, sel, density, probeRadius)`).
 *   - Add the object to the scene, embed it, and attach a default `molsurf`
 *     renderer (target/sel/colormode=molecule/CPKColoring), matching UXP.
 *   - All mutations run inside a single "Create mol surface" undo txn.
 *
 * The molecule picker, selection editing, density and probe-radius inputs
 * live client-side in `MakeMolSurfDialog`; this service only performs the
 * C++ object creation so it can be wrapped in one undo step. The companion
 * `proposeMolSurfName` action backs the dialog's `sf_<molname>` name prefill
 * (UXP `makeSugName`). The UXP regeneration mode (`regenerateSES1`) is out of
 * scope for this migration.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { MolSurfObj } from '@cuemol/core/src/wrappers/MolSurfObj';
import type { MolSurfRenderer } from '@cuemol/core/src/wrappers/MolSurfRenderer';
import type { ColoringScheme } from '@cuemol/core/src/wrappers/ColoringScheme';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { uniqName } from '@renderer/worker/server/services/helpers/uniqName';
import { withUndoTxn } from './withUndoTxn';

export interface MakeMolSurfArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
    /** Atom-selection expression; empty string means "all atoms". */
    selStr: string;
    /** Surface object name; empty falls back to a unique `sf_<molname>`. */
    surfName: string;
    /** Point density (/A); coerced to >= 1. */
    density: number;
    /** Probe radius (A); coerced to >= 0.1 (default 1.4). */
    probeRadius: number;
    /**
     * SES backend for this generation (C++ `sesbackend` enum id). Omitted or
     * 'auto' leaves the object's default, which follows the build.
     */
    backend?: 'auto' | 'meshms' | 'ball';
}

export interface MakeMolSurfResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
    /** UID of the new MolSurfObj on success. */
    newObjId?: number;
    /** Resolved unique name of the new object. */
    newObjName?: string;
}

export interface ProposeMolSurfNameArgs {
    sceneId: number;
    /** Target MolCoord object uid. */
    objId: number;
}

export interface ProposeMolSurfNameResult {
    /** Suggested unique surface name, or '' when the molecule is missing. */
    name: string;
}

/**
 * Suggest the default surface-object name for a molecule -- a unique
 * `sf_<molname>`, mirroring UXP `makeSugName`. The dialog calls this to
 * prefill the name field when the target molecule changes.
 */
function proposeMolSurfName(
    ctx: WorkerContext,
    args: ProposeMolSurfNameArgs,
): ProposeMolSurfNameResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { name: '' };
    const mol = scene.getObject(args.objId) as CueMolObject | null;
    if (!mol) return { name: '' };
    const molName = (mol as unknown as { name: string }).name ?? 'mol';
    return { name: uniqName(`sf_${molName}`, (n) => !!scene.getObjectByName(n)) };
}

function makeMolSurf(
    ctx: WorkerContext,
    args: MakeMolSurfArgs,
): MakeMolSurfResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const mol = scene.getObject(args.objId) as CueMolObject | null;
    if (!mol) return { ok: false, error: 'molecule not found' };

    const sel = makeSel(ctx, args.selStr ?? '', scene.uid);
    if (!sel) return { ok: false, error: 'invalid selection' };

    // Coerce numeric inputs the same way UXP does (NaN / out-of-range guards).
    let density = Math.floor(args.density);
    if (!Number.isFinite(density) || density < 1) density = 1;
    let probeRadius = args.probeRadius;
    if (!Number.isFinite(probeRadius) || probeRadius < 0.1) probeRadius = 1.4;

    const molName = (mol as unknown as { name: string }).name ?? 'mol';
    const surfName =
        args.surfName.trim() !== ''
            ? args.surfName.trim()
            : uniqName(`sf_${molName}`, (n) => !!scene.getObjectByName(n));
    const rendName = uniqName('molsurf', (n) => !!scene.getRendByName(n));

    let newObjId = -1;
    let newObjName = '';

    // Roll back the whole txn on any failure (UXP `buildMolSurf` rollback path):
    // let the error propagate out of `withUndoTxn` rather than swallowing it.
    try {
        withUndoTxn(scene, 'Create mol surface', () => {
            const surf = ctx.svc.createObj('MolSurfObj') as MolSurfObj;
            // `sesbackend` is an enum property: the generated wrapper types it
            // as number, but the C++ layer takes/returns the string id.
            if (args.backend && args.backend !== 'auto') {
                (surf as unknown as { sesbackend: string }).sesbackend =
                    args.backend;
            }
            surf.createSESFromMol(
                mol as unknown as MolCoord,
                sel as unknown as MolSelection,
                density,
                probeRadius,
            );

            (surf as unknown as { name: string }).name = surfName;
            scene.addObject(surf as unknown as CueMolObject);
            (surf as unknown as { forceEmbed: () => void }).forceEmbed();
            newObjId = (surf as unknown as { uid: number }).uid;
            newObjName = surfName;

            const rend = (surf as unknown as CueMolObject).createRenderer(
                'molsurf',
            ) as unknown as MolSurfRenderer;
            (rend as unknown as { name: string }).name = rendName;
            rend.target = molName;
            if (args.selStr.trim() !== '') {
                rend.sel = sel as unknown as MolSelection;
            }
            // enum-typed property: assigned as string at runtime per CueMol qif.
            rend.colormode = 'molecule' as unknown as number;
            rend.coloring = ctx.svc.createObj(
                'CPKColoring',
            ) as unknown as ColoringScheme;
        });
    } catch (e) {
        return { ok: false, error: String(e) };
    }

    if (newObjId < 0) return { ok: false, error: 'createSESFromMol failed' };
    return { ok: true, newObjId, newObjName };
}

export const services = {
    makeMolSurf,
    proposeMolSurfName,
};
