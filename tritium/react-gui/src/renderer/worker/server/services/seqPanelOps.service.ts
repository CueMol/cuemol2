/**
 * @file worker/server/services/seqPanelOps.service.ts
 * @description Worker services for the bottom Sequence panel
 * (`panel.btmpanel-holder.seq`). Backs single-residue toggle, range
 * select by residue range, and view-centering on a specific residue.
 *
 * Mirrors UXP `bottom-panels/seqpanel.js` `toggleResidSel` / `rangeSelect`
 * / `centerAt`. The ResidRangeSet pattern matches `naviTool.service.ts`
 * `naviResidSel` (hit-test counterpart); here the chain + residue index
 * arrive directly from the UI, no hit test required.
 */

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolResidue } from '@cuemol/core/src/wrappers/MolResidue';
import type { ResidRangeSet } from '@cuemol/core/src/wrappers/ResidRangeSet';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull, getViewSceneObjOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

// --- toggleResidueSelection ---

export interface ToggleResidueSelectionArgs {
    sceneId: number;
    molId: number;
    chainName: string;
    /** ResidIndex string (e.g. "10" or "10A"). */
    residueIndex: string;
}

export interface ToggleResidueSelectionResult {
    ok: boolean;
}

function autoCreateSelRend(mol: MolCoord): void {
    if (!mol.getRendererByType('*selection')) {
        mol.createRenderer('*selection');
    }
}

function toggleResidueSelection(
    ctx: WorkerContext,
    args: ToggleResidueSelectionArgs,
): ToggleResidueSelectionResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false };

    const residue = mol.getResidue(args.chainName, args.residueIndex) as MolResidue | null;
    if (!residue) return { ok: false };

    let ok = false;
    withUndoTxn(scene, 'Toggle select atom(s)', () => {
        autoCreateSelRend(mol);
        const rrs = ctx.svc.createObj('ResidRangeSet') as ResidRangeSet;
        rrs.fromSel(mol, mol.sel);

        const addSel = makeSel(ctx, `'${args.chainName}'.${args.residueIndex}.*`, scene.uid);
        if (addSel === null) return;

        if (rrs.contains(residue)) {
            rrs.remove(mol, addSel);
        } else {
            rrs.append(mol, addSel);
        }
        mol.sel = rrs.toSel(mol);
        ok = true;
    });
    return { ok };
}

// --- rangeSelectResidues ---

export interface RangeSelectResiduesArgs {
    sceneId: number;
    molId: number;
    chainName: string;
    /** ResidIndex string of the range start (marker / mPrevRes). */
    fromIndex: string;
    /** ResidIndex string of the range end (mouseup / click target). */
    toIndex: string;
    /**
     * When true, if the `from` residue is already selected, the range is
     * removed (toggle-off); when false, the range is unconditionally
     * appended. Mirrors UXP `panel.rangeSelect(res, bToggle)`.
     */
    toggle: boolean;
}

export interface RangeSelectResiduesResult {
    ok: boolean;
}

function rangeSelectResidues(
    ctx: WorkerContext,
    args: RangeSelectResiduesArgs,
): RangeSelectResiduesResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false };

    const fromResidue = mol.getResidue(args.chainName, args.fromIndex) as MolResidue | null;
    if (!fromResidue) return { ok: false };

    let ok = false;
    withUndoTxn(scene, 'Toggle select atom(s)', () => {
        autoCreateSelRend(mol);
        const rrs = ctx.svc.createObj('ResidRangeSet') as ResidRangeSet;
        rrs.fromSel(mol, mol.sel);

        const addSel = makeSel(
            ctx,
            `'${args.chainName}'.${args.toIndex}:${args.fromIndex}.*`,
            scene.uid,
        );
        if (addSel === null) return;

        if (args.toggle && rrs.contains(fromResidue)) {
            rrs.remove(mol, addSel);
        } else {
            rrs.append(mol, addSel);
        }
        mol.sel = rrs.toSel(mol);
        ok = true;
    });
    return { ok };
}

// --- centerOnResidue ---

export interface CenterOnResidueArgs {
    viewId: number;
    sceneId: number;
    molId: number;
    chainName: string;
    residueIndex: string;
}

export interface CenterOnResidueResult {
    ok: boolean;
}

function centerOnResidue(
    ctx: WorkerContext,
    args: CenterOnResidueArgs,
): CenterOnResidueResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.molId);
    if (!vsm) return { ok: false };
    if (vsm.scene.uid !== args.sceneId) return { ok: false };

    const residue = vsm.obj.getResidue(args.chainName, args.residueIndex) as MolResidue | null;
    if (!residue) return { ok: false };

    let pos;
    try {
        pos = residue.getPivotPos();
    } catch {
        return { ok: false };
    }
    if (!pos) return { ok: false };
    vsm.view.setViewCenter(pos);
    return { ok: true };
}

export const services = {
    toggleResidueSelection,
    rangeSelectResidues,
    centerOnResidue,
};
