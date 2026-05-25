/**
 * @file services/symmetryPanelOps.service.ts
 * @description Worker services backing the Symmetry side panel
 * (`panel.symmetry`). Mirrors UXP `symmetry-panel.js`
 * (`cuemolui.panels.symm.*`) and the Change-symminfo modal
 * (`tools/symm-chg-dlg.js`):
 *   - `getSymmetryPanelInfo` -- `updateWidget` (CrystalInfo read)
 *   - `getSpaceGroupNames`   -- `SymmOpManager.getSgNamesJSON`
 *   - `changeSymmetryInfo`   -- accept handler
 *     (`SymmOpManager.changeXtalInfo`)
 *   - `showSymmRenderer`     -- `showSymmRend` ("*symm" renderer
 *     setup with extent / unitcell / autoupdate / center)
 *   - `showUnitCellRenderer` -- `showUnitCell` ("*unitcell"
 *     renderer one-shot create)
 *
 * Object enumeration for the selector dropdown lives in
 * `listSceneObjects.service` (consumed by the `ObjectSelect`
 * widget); the MolCoord-vs-DensityMap filter is applied client-side.
 *
 * The renderer-specific properties (`extent`, `unitcell`,
 * `autoupdate`, `center`) live on the C++ symm-renderer classes and
 * are not surfaced on the base TS Renderer wrapper; we set them
 * generically via `setProp`.
 */

import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { CrystalInfo } from '@cuemol/core/src/wrappers/CrystalInfo';
import type { SymmOpManager } from '@cuemol/core/src/wrappers/SymmOpManager';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull, getViewSceneOrNull } from './helpers/sceneResolver';
import { withUndoTxn } from './withUndoTxn';

const MOL_CLASSES = new Set(['MolCoord', 'PDBMol', 'MmCifMol']);

/**
 * Duck-type probe for "looks like a MolCoord" without hard-coding
 * the (small) set of subclasses. Mirrors UXP
 * `cuemol.implIface(elem.type, "MolCoord")` indirectly. Used by
 * `getSymmetryPanelInfo` to populate the `isMol` flag the panel
 * consumes for button-enablement.
 */
function classIsMolLike(className: string): boolean {
    if (MOL_CLASSES.has(className)) return true;
    return className.endsWith('Mol');
}

// --- getSymmetryPanelInfo ---

export interface GetSymmetryPanelInfoArgs {
    sceneId: number;
    objId: number;
}

export interface SymmetryInfo {
    /** UPPERCASE enum string (TRICLINIC / MONOCLINIC / ... / CUBIC). */
    lattice: string;
    hm_spacegroup: string;
    a: number;
    b: number;
    c: number;
    alpha: number;
    beta: number;
    gamma: number;
    nsg: number;
}

export interface GetSymmetryPanelInfoResult {
    /** Crystal info read from `obj.getExtData("CrystalInfo")`, or null. */
    info: SymmetryInfo | null;
    /** True iff the object exists. */
    objectExists: boolean;
    /** True iff `info != null` (object has attached CrystalInfo). */
    hasInfo: boolean;
    /** True iff the underlying object is MolCoord-like. */
    isMol: boolean;
    /** True iff all of a / b / c are >= 0.1 (cell big enough to draw). */
    cellOk: boolean;
}

const EMPTY_INFO: GetSymmetryPanelInfoResult = {
    info: null,
    objectExists: false,
    hasInfo: false,
    isMol: false,
    cellOk: false,
};

function readCrystalInfo(obj: CueMolObject): CrystalInfo | null {
    try {
        return obj.getExtData('CrystalInfo') as CrystalInfo | null;
    } catch {
        return null;
    }
}

function getSymmetryPanelInfo(
    ctx: WorkerContext,
    args: GetSymmetryPanelInfoArgs,
): GetSymmetryPanelInfoResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return EMPTY_INFO;
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return EMPTY_INFO;

    const className = (obj as unknown as { getClassName?: () => string }).getClassName?.() ?? '';
    const isMol = classIsMolLike(className);

    const xi = readCrystalInfo(obj);
    if (!xi) {
        return { info: null, objectExists: true, hasInfo: false, isMol, cellOk: false };
    }

    let info: SymmetryInfo;
    try {
        info = {
            lattice: xi.lattice,
            hm_spacegroup: xi.hm_spacegroup,
            a: xi.a,
            b: xi.b,
            c: xi.c,
            alpha: xi.alpha,
            beta: xi.beta,
            gamma: xi.gamma,
            nsg: xi.nsg,
        };
    } catch {
        return { info: null, objectExists: true, hasInfo: false, isMol, cellOk: false };
    }

    const cellOk = info.a >= 0.1 && info.b >= 0.1 && info.c >= 0.1;
    return { info, objectExists: true, hasInfo: true, isMol, cellOk };
}

// --- getSpaceGroupNames ---

export interface GetSpaceGroupNamesArgs {
    /** Crystal-system enum string, e.g. "HEXAGONAL". */
    lattice: string;
}

export interface SpaceGroupEntry {
    /** Numeric id used as `nsg`. */
    id: number;
    /** Display name shown in the dropdown (e.g. "P 6 1"). */
    cname: string;
}

export interface GetSpaceGroupNamesResult {
    items: SpaceGroupEntry[];
}

interface RawSgEntry {
    id?: unknown;
    cname?: unknown;
}

function getSpaceGroupNames(
    ctx: WorkerContext,
    args: GetSpaceGroupNamesArgs,
): GetSpaceGroupNamesResult {
    const symmMgr = ctx.svc.getService('SymmOpManager') as SymmOpManager | null;
    if (!symmMgr) return { items: [] };

    let json: string;
    try {
        json = symmMgr.getSgNamesJSON(args.lattice);
    } catch {
        return { items: [] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { items: [] };
    }
    if (!Array.isArray(parsed)) return { items: [] };

    const items: SpaceGroupEntry[] = [];
    for (const raw of parsed as RawSgEntry[]) {
        const id = typeof raw?.id === 'number' ? raw.id : Number(raw?.id);
        if (!Number.isFinite(id)) continue;
        items.push({
            id,
            cname: typeof raw?.cname === 'string' ? raw.cname : String(raw?.cname ?? ''),
        });
    }
    return { items };
}

// --- changeSymmetryInfo ---

export interface ChangeSymmetryInfoArgs {
    sceneId: number;
    objId: number;
    a: number;
    b: number;
    c: number;
    alpha: number;
    beta: number;
    gamma: number;
    /** Space group number (encodes lattice + setting). */
    nsg: number;
}

export interface ChangeSymmetryInfoResult {
    ok: boolean;
    /** Populated with the C++ error message when ok=false. */
    error?: string;
}

function changeSymmetryInfo(
    ctx: WorkerContext,
    args: ChangeSymmetryInfoArgs,
): ChangeSymmetryInfoResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false, error: 'object not found' };

    const symmMgr = ctx.svc.getService('SymmOpManager') as SymmOpManager | null;
    if (!symmMgr) return { ok: false, error: 'SymmOpManager unavailable' };

    let err: string | null = null;
    withUndoTxn(scene, 'Change symminfo', () => {
        try {
            symmMgr.changeXtalInfo(
                args.objId,
                args.a, args.b, args.c,
                args.alpha, args.beta, args.gamma,
                args.nsg,
            );
        } catch (e) {
            err = String(e);
        }
    });
    if (err !== null) return { ok: false, error: err };
    return { ok: true };
}

// --- showSymmRenderer ---

export type SymmRendererExtent = number | 'unitcell';

export interface ShowSymmRendererArgs {
    sceneId: number;
    objId: number;
    /**
     * View used to read the current view center for finite-extent
     * mode. Ignored for `extent='unitcell'`.
     */
    viewId: number;
    extent: SymmRendererExtent;
}

export interface ShowSymmRendererResult {
    ok: boolean;
    error?: string;
}

function setupSymmRendererProps(
    rend: Renderer,
    extent: SymmRendererExtent,
    viewCenter: Vector | null,
): void {
    if (extent === 'unitcell') {
        rend.setProp('unitcell', true);
        rend.setProp('autoupdate', false);
        return;
    }
    rend.setProp('extent', extent);
    rend.setProp('unitcell', false);
    rend.setProp('autoupdate', true);
    if (viewCenter !== null) {
        rend.setProp('center', (viewCenter as unknown as { wrapped: unknown }).wrapped);
    }
}

function showSymmRenderer(
    ctx: WorkerContext,
    args: ShowSymmRendererArgs,
): ShowSymmRendererResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false, error: 'object not found' };

    let viewCenter: Vector | null = null;
    if (args.extent !== 'unitcell') {
        const vs = getViewSceneOrNull(ctx, args.viewId);
        if (vs) {
            try {
                viewCenter = vs.view.getViewCenter() as Vector;
            } catch {
                viewCenter = null;
            }
        }
    }

    let err: string | null = null;
    withUndoTxn(scene as Scene, 'Show sym mol', () => {
        let rend = obj.getRendererByType('*symm') as Renderer | null;
        try {
            if (!rend) {
                rend = obj.createRenderer('*symm') as Renderer;
                rend.name = 'symm';
            }
            setupSymmRendererProps(rend, args.extent, viewCenter);
        } catch (e) {
            err = String(e);
        }
    });
    if (err !== null) return { ok: false, error: err };
    return { ok: true };
}

// --- showUnitCellRenderer ---

export interface ShowUnitCellRendererArgs {
    sceneId: number;
    objId: number;
}

export interface ShowUnitCellRendererResult {
    ok: boolean;
    /** True iff a new renderer was created (false = already existed). */
    created: boolean;
    error?: string;
}

function showUnitCellRenderer(
    ctx: WorkerContext,
    args: ShowUnitCellRendererArgs,
): ShowUnitCellRendererResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, created: false, error: 'scene not found' };
    const obj = scene.getObject(args.objId) as CueMolObject | null;
    if (!obj) return { ok: false, created: false, error: 'object not found' };

    if (obj.getRendererByType('*unitcell')) {
        return { ok: true, created: false };
    }

    let err: string | null = null;
    withUndoTxn(scene as Scene, 'Show unitcell', () => {
        try {
            const rend = obj.createRenderer('*unitcell') as Renderer;
            rend.name = 'unitcell';
        } catch (e) {
            err = String(e);
        }
    });
    if (err !== null) return { ok: false, created: false, error: err };
    return { ok: true, created: true };
}

export const services = {
    getSymmetryPanelInfo,
    getSpaceGroupNames,
    changeSymmetryInfo,
    showSymmRenderer,
    showUnitCellRenderer,
};
