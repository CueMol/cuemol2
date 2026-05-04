import type { WorkerContext } from '../types/WorkerContext';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { NameLabelRenderer } from '@cuemol/core/src/wrappers/NameLabelRenderer';
import type { ResidRangeSet } from '@cuemol/core/src/wrappers/ResidRangeSet';
import type { SelCommand } from '@cuemol/core/src/wrappers/SelCommand';
import type { MolResidue } from '@cuemol/core/src/wrappers/MolResidue';
import type { HitTestResult } from '../../types';
import { withUndoTxn } from './withUndoTxn';

// ---- internal helpers ----

function runHitTest(ctx: WorkerContext, viewId: number, x: number, y: number): HitTestResult | null {
    const view = ctx.sceMgr.getView(viewId) as GUIView;
    if (!view) return null;
    const sres = view.hitTest(x, y);
    if (!sres) return null;
    try {
        return JSON.parse(sres) as HitTestResult;
    } catch {
        return null;
    }
}

function makeSel(ctx: WorkerContext, selStr: string, sceneUid: number): SelCommand {
    const sel = ctx.svc.createCppObj('SelCommand') as SelCommand;
    sel.compile(selStr, sceneUid);
    return sel;
}

function toggleAtomLabel(ctx: WorkerContext, mol: MolCoord, atomId: number): void {
    const labelType = '*namelabel';
    let labelRend = mol.getRendererByNameType('', labelType) as NameLabelRenderer | null;

    if (!labelRend) {
        labelRend = mol.createRenderer(labelType) as NameLabelRenderer;
        labelRend.applyStyles('DefaultLabel');
    }

    const added = labelRend.addLabel(atomId);
    if (!added) {
        labelRend.removeLabel(atomId);
    }
}

function writeMsgLog(ctx: WorkerContext, message: string): void {
    const msgTuple = ctx.svc.getService('MsgLog');
    if (!msgTuple) return;
    ctx.svc.invokeMethod('writeln', msgTuple as any, [message]);
}

// ---- service: naviHitTest (read-only) ----

export interface NaviHitTestArgs {
    viewId: number;
    x: number;
    y: number;
}

export interface NaviHitTestResult {
    hit: boolean;
    raw?: HitTestResult;
}

function naviHitTest(ctx: WorkerContext, args: NaviHitTestArgs): NaviHitTestResult {
    const raw = runHitTest(ctx, args.viewId, args.x, args.y);
    if (!raw) return { hit: false };
    return { hit: true, raw };
}

// ---- service: naviClickAtom (left click — hittest + log + atom label toggle) ----

export interface NaviClickAtomArgs {
    viewId: number;
    x: number;
    y: number;
}

export interface NaviClickAtomResult {
    handled: boolean;
    statusMessage?: string;
    hitres?: HitTestResult;
}

function naviClickAtom(ctx: WorkerContext, args: NaviClickAtomArgs): NaviClickAtomResult {
    const raw = runHitTest(ctx, args.viewId, args.x, args.y);
    if (!raw) return { handled: false };

    if (raw.objtype !== 'MolCoord') {
        const msg = `LWObject [${raw.obj_name}], ${raw.message}`;
        writeMsgLog(ctx, msg);
        return { handled: true, statusMessage: msg, hitres: raw };
    }

    let statusMessage = `Molecule [${raw.obj_name}], ${raw.message}`;
    statusMessage += `, O: ${raw.occ.toFixed(2)} B: ${raw.bfac.toFixed(2)}`;
    statusMessage += ` Pos: (${raw.x.toFixed(3)}, ${raw.y.toFixed(3)}, ${raw.z.toFixed(3)})`;
    if (raw.rendtype === '*symm' && raw.symm_name) {
        statusMessage += ` (symop: ${raw.symm_name})`;
    }

    writeMsgLog(ctx, statusMessage);

    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    const scene = view.getScene();
    const mol = scene.getObject(raw.obj_id) as MolCoord;
    if (mol) {
        withUndoTxn(scene, 'Add atom label', () => {
            toggleAtomLabel(ctx, mol, raw.atom_id);
        });
    }

    return { handled: true, statusMessage, hitres: raw };
}

// ---- service: naviResidSel (double click — residue selection toggle/extend) ----

export interface NaviResidSelArgs {
    viewId: number;
    x: number;
    y: number;
    mode: 'toggle' | 'extend';
    prevObjId?: number;
    prevAtomId?: number;
}

export interface NaviResidSelResult {
    handled: boolean;
    objId?: number;
    atomId?: number;
}

function naviResidSel(ctx: WorkerContext, args: NaviResidSelArgs): NaviResidSelResult {
    const raw = runHitTest(ctx, args.viewId, args.x, args.y);
    if (!raw || raw.objtype !== 'MolCoord') return { handled: false };

    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    const scene = view.getScene();
    const mol = scene.getObject(raw.obj_id) as MolCoord;
    if (!mol) return { handled: false };

    const atom = mol.getAtomByID(raw.atom_id);
    if (!atom) return { handled: false };

    const chainName: string = atom.chainName;
    const residIndex: string = atom.residIndex;

    withUndoTxn(scene, 'Toggle select atom(s)', () => {
        const rrs = ctx.svc.createCppObj('ResidRangeSet') as ResidRangeSet;
        rrs.fromSel(mol, mol.sel);

        if (args.mode === 'extend') {
            if (args.prevObjId !== raw.obj_id) return;
            if (args.prevAtomId == null) return;

            const prevAtom = mol.getAtomByID(args.prevAtomId);
            if (!prevAtom) return;
            if (prevAtom.chainName !== chainName) return;

            const prevResidIndex = prevAtom.residIndex;
            const addSel = makeSel(ctx, `'${chainName}'.${prevResidIndex}:${residIndex}.*`, scene.uid);
            rrs.append(mol, addSel);
        } else {
            const resid = mol.getResidue(chainName, residIndex) as MolResidue;
            const addSel = makeSel(ctx, `'${chainName}'.${residIndex}.*`, scene.uid);
            if (resid && rrs.contains(resid)) {
                rrs.remove(mol, addSel);
            } else {
                rrs.append(mol, addSel);
            }
        }

        mol.sel = rrs.toSel(mol);
    });

    return { handled: true, objId: raw.obj_id, atomId: raw.atom_id };
}

// ---- registration ----

export const services = {
    naviHitTest,
    naviClickAtom,
    naviResidSel,
};
