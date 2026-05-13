// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase: panel.workspace.ctxmenu.renderer — "Change sel" submenu.
//
// Mirrors UXP `ws.setRendSel` in `workspace_panel_molsel.js`. The renderer
// keeps its own `sel` (used to restrict display) which is independent of
// the parent mol's UI selection. This service rebinds that `rend.sel`
// either to the mol's current selection ('current') or to a fresh
// compiled SelCommand for one of the canned predicates.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { WorkerContext } from '../types/WorkerContext';
import type { ChangeRendSelKind } from '../../../../shared/ipcTypes';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface SetRendererSelectionArgs {
    sceneId: number;
    rendId: number;
    selKind: ChangeRendSelKind;
}

export interface SetRendererSelectionResult {
    ok: boolean;
}

// Selection strings for the non-'current' kinds. 'ligand' is the inverse
// of the standard biopolymer / solvent predicates, matching UXP XUL.
const SEL_STRINGS: Record<Exclude<ChangeRendSelKind, 'current'>, string> = {
    all: '*',
    protein: 'protein',
    nucleic: 'nucleic',
    water: 'water',
    ligand: '!protein & !nucleic & !water',
    sugar: 'sugar',
};

function hasSelProp(obj: unknown): boolean {
    return obj != null && 'sel' in (obj as Record<string, unknown>);
}

function setRendererSelection(
    ctx: WorkerContext,
    args: SetRendererSelectionArgs,
): SetRendererSelectionResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };
    if (!hasSelProp(rend)) return { ok: false };

    let mol: MolCoord | null = null;
    try {
        mol = rend.getClientObj() as MolCoord | null;
    } catch {
        return { ok: false };
    }
    if (!mol || !hasSelProp(mol)) return { ok: false };

    let sel: MolSelection | null;
    if (args.selKind === 'current') {
        try {
            sel = mol.sel ?? null;
        } catch {
            sel = null;
        }
    } else {
        const selStr = SEL_STRINGS[args.selKind];
        sel = makeSel(ctx, selStr, scene.uid) as unknown as MolSelection | null;
    }
    if (!sel) return { ok: false };

    withUndoTxn(scene, 'Set renderer sel', () => {
        (rend as unknown as MolRenderer).sel = sel as MolSelection;
    });
    return { ok: true };
}

export const services = {
    setRendererSelection,
};
