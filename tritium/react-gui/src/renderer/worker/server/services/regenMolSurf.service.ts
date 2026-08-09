/**
 * @file services/regenMolSurf.service.ts
 * @description Worker service backing the scene-tree object context-menu item
 * "Regenerate surface..." (UXP `wspcPanelMolSurfRegen`). Ports
 * `workspace_panel_ctxtmenu.js` `setupMolSurfCtxtMenu` (the menu gate) and
 * `tools/makesurf.js` `regenMolSurf` (the commit):
 *   - `getMolSurfRegenInfo` reports whether a scene object is a `MolSurfObj`
 *     whose origin molecule is still resolvable, and returns the stored
 *     generation parameters (`orig_mol` / `orig_sel` / `orig_den` /
 *     `orig_prad`) so the menu can gate and the dialog can prefill.
 *   - `regenMolSurf` calls `MolSurfObj.regenerateSES1(density)` inside a
 *     "Regenerate mol surface" undo txn.
 *
 * Only the point density is a parameter: the `.qif` exposes just the first
 * argument of C++ `MolSurfObj::regenerateSES(density, probe_r, pSel)`, so the
 * probe radius, atom selection and target molecule always come from the
 * object's own cached `orig_*` state. C++ pushes its own vertex/face snapshot
 * (`MolSurfEditInfo`) into the enclosing transaction, so the txn here only
 * supplies the undo label.
 */

import type { MolSurfObj } from '@cuemol/core/src/wrappers/MolSurfObj';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { safeRead } from './helpers/safeRead';
import { tryUndoTxn } from './withUndoTxn';

export interface GetMolSurfRegenInfoArgs {
    sceneId: number;
    /** Target object uid (any class -- the class check happens here). */
    objId: number;
}

export interface GetMolSurfRegenInfoResult {
    /** False when the scene or the object could not be resolved. */
    ok: boolean;
    /** True only for a MolSurfObj whose origin molecule is in the scene. */
    canRegen: boolean;
    /** Name of the surface object itself; '' when unresolved. */
    objName: string;
    /** `orig_mol` -- the origin molecule's name; '' when never generated. */
    origMol: string;
    /** Whether `origMol` still resolves to an object in the scene. */
    origMolFound: boolean;
    /** `orig_sel` rendered as a selection string; '' means all atoms. */
    selStr: string;
    /** `orig_den` -- the point density the surface was last built with. */
    density: number;
    /** `orig_prad` -- the probe radius the surface was last built with. */
    probeRadius: number;
}

export interface RegenMolSurfArgs {
    sceneId: number;
    /** Target MolSurfObj uid. */
    objId: number;
    /** New point density (/A); coerced to an integer >= 1. */
    density: number;
}

export interface RegenMolSurfResult {
    ok: boolean;
    /** Populated with the failure reason when ok=false. */
    error?: string;
}

const EMPTY_INFO: GetMolSurfRegenInfoResult = {
    ok: false,
    canRegen: false,
    objName: '',
    origMol: '',
    origMolFound: false,
    selStr: '',
    density: 0,
    probeRadius: 0,
};

/**
 * Coerce a point density the way UXP intends to -- an integer of at least 1.
 *
 * UXP's own guard (`if (nden==NaN || nden<1)`) never fires for NaN because
 * `NaN == NaN` is false, so a blank density field reaches C++ as NaN. The
 * `Number.isFinite` check here closes that hole; the clamp matches
 * `makeMolSurf.service.ts`.
 */
function coerceDensity(value: number): number {
    const den = Math.floor(value);
    if (!Number.isFinite(den) || den < 1) return 1;
    return den;
}

/**
 * Read the regeneration state of a scene object.
 *
 * Mirrors the three-state gate of UXP `setupMolSurfCtxtMenu`: not a
 * `MolSurfObj` -> hide the menu item (`ok:true, canRegen:false` with an empty
 * `origMol`), origin molecule missing -> show it disabled
 * (`canRegen:false`), otherwise -> enabled.
 */
function getMolSurfRegenInfo(
    ctx: WorkerContext,
    args: GetMolSurfRegenInfoArgs,
): GetMolSurfRegenInfoResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ...EMPTY_INFO };

    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ...EMPTY_INFO };

    // Worker-side wrappers expose the class through the getClassName() METHOD;
    // a `className` property reads back undefined (same trap as
    // getNewRendererOptions.service.ts).
    const className =
        safeRead(() =>
            (obj as unknown as { getClassName?: () => string }).getClassName?.(),
        ) ?? '';
    if (className !== 'MolSurfObj') return { ...EMPTY_INFO, ok: true };

    const surf = obj as unknown as MolSurfObj;
    const objName = safeRead(() => (obj as unknown as { name: string }).name) ?? '';
    const origMol = safeRead(() => surf.orig_mol) ?? '';
    const origMolFound = origMol !== '' && !!scene.getObjectByName(origMol);
    const selStr = safeRead(() => surf.orig_sel?.toString()) ?? '';
    const density = safeRead(() => surf.orig_den) ?? 0;
    const probeRadius = safeRead(() => surf.orig_prad) ?? 0;

    return {
        ok: true,
        canRegen: origMolFound,
        objName,
        origMol,
        origMolFound,
        selStr,
        density,
        probeRadius,
    };
}

/**
 * Rebuild a MolSurfObj from its origin molecule at a new point density
 * (UXP `regenMolSurf`).
 */
function regenMolSurf(
    ctx: WorkerContext,
    args: RegenMolSurfArgs,
): RegenMolSurfResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };

    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false, error: 'surface object not found' };

    const surf = obj as unknown as MolSurfObj;
    if (typeof surf.regenerateSES1 !== 'function') {
        return { ok: false, error: 'object is not a MolSurfObj' };
    }

    const density = coerceDensity(args.density);
    return tryUndoTxn(scene, 'Regenerate mol surface', () => {
        surf.regenerateSES1(density);
    });
}

export const services = {
    getMolSurfRegenInfo,
    regenMolSurf,
};
