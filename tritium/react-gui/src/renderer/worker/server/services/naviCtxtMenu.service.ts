// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '../types/WorkerContext';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolAtom } from '@cuemol/core/src/wrappers/MolAtom';
import type { SymmRenderer } from '@cuemol/core/src/wrappers/SymmRenderer';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import { makeSel } from './helpers/makeSel';
import { invertSelStr, rewriteAround, toggleSidechainStr } from './helpers/selStrTransforms';
import { getViewSceneOrNull, getViewSceneObjOrNull } from './helpers/sceneResolver';
import { withUndoTxn } from './withUndoTxn';

type SelectMode = 'atom' | 'residue' | 'chain' | 'mol';

// ---- internal helpers ----

function autoCreateSelRend(mol: MolCoord): void {
    const selRend = mol.getRendererByType('*selection');
    if (!selRend) {
        mol.createRenderer('*selection');
    }
}

function applyMolSel(ctx: WorkerContext, mol: MolCoord, selStr: string, sceneUid: number): void {
    autoCreateSelRend(mol);
    const sel = makeSel(ctx, selStr, sceneUid);
    if (sel === null) return;
    mol.sel = sel;
}

function buildSelStr(mol: MolCoord, atomId: number, mode: SelectMode): string | null {
    const atom = mol.getAtomByID(atomId) as MolAtom;
    if (!atom) return null;
    const chainName: string = atom.chainName;
    const residIndex: string = atom.residIndex;

    switch (mode) {
        case 'atom':     return `aid ${atomId}`;
        case 'residue':  return `'${chainName}'.${residIndex}.*`;
        case 'chain':    return `c;${chainName}`;
        case 'mol':      return '*';
    }
}

// ---- services ----

export interface NaviCenterAtArgs { viewId: number; x: number; y: number; z: number; }

function naviCenterAt(ctx: WorkerContext, args: NaviCenterAtArgs): { ok: boolean } {
    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return { ok: false };
    const pos = ctx.svc.createObj('Vector') as Vector;
    pos.set3(args.x, args.y, args.z);
    vs.view.setViewCenter(pos);
    return { ok: true };
}

export interface NaviCenterAtSymmArgs {
    viewId: number; objId: number; rendId: number; atomId: number; symmId: number;
}

function naviCenterAtSymm(ctx: WorkerContext, args: NaviCenterAtSymmArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const rend = vsm.scene.getRenderer(args.rendId) as SymmRenderer;
    if (!rend) return { ok: false };
    const atom = vsm.obj.getAtomByID(args.atomId) as MolAtom;
    if (!atom) return { ok: false };
    const pos = atom.pos as Vector;
    const matrix = rend.getXformMatrix(args.symmId);
    pos.w = 1.0;
    const transformedPos = matrix.mulvec(pos);
    vsm.view.setViewCenter(transformedPos);
    return { ok: true };
}

export interface NaviCtxSelectArgs { viewId: number; objId: number; atomId: number; mode: SelectMode; }

function naviCtxSelect(ctx: WorkerContext, args: NaviCtxSelectArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const selStr = buildSelStr(vsm.obj, args.atomId, args.mode);
    if (!selStr) return { ok: false };
    withUndoTxn(vsm.scene, 'Select atom(s)', () => {
        applyMolSel(ctx, vsm.obj, selStr, vsm.scene.uid);
    });
    return { ok: true };
}

function naviCtxAddSelect(ctx: WorkerContext, args: NaviCtxSelectArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const newSelStr = buildSelStr(vsm.obj, args.atomId, args.mode);
    if (!newSelStr) return { ok: false };
    withUndoTxn(vsm.scene, 'Add select atom(s)', () => {
        const prevSelStr = vsm.obj.sel.toString();
        const selStr = prevSelStr ? `(${prevSelStr}) or (${newSelStr})` : newSelStr;
        applyMolSel(ctx, vsm.obj, selStr, vsm.scene.uid);
    });
    return { ok: true };
}

export interface NaviCtxObjArgs { viewId: number; objId: number; }

function naviCtxUnselect(ctx: WorkerContext, args: NaviCtxObjArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    withUndoTxn(vsm.scene, 'Unselect molecule', () => {
        applyMolSel(ctx, vsm.obj, '', vsm.scene.uid);
    });
    return { ok: true };
}

function naviCtxInvertSel(ctx: WorkerContext, args: NaviCtxObjArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    withUndoTxn(vsm.scene, 'Invert mol selection', () => {
        const prevSelStr = vsm.obj.sel.toString();
        applyMolSel(ctx, vsm.obj, invertSelStr(prevSelStr), vsm.scene.uid);
    });
    return { ok: true };
}

function naviCtxToggleSidechain(ctx: WorkerContext, args: NaviCtxObjArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const prevSelStr = vsm.obj.sel.toString();
    if (!prevSelStr) return { ok: false };
    withUndoTxn(vsm.scene, 'Toggle bysidech', () => {
        applyMolSel(ctx, vsm.obj, toggleSidechainStr(prevSelStr), vsm.scene.uid);
    });
    return { ok: true };
}

export interface NaviCtxAroundArgs { viewId: number; objId: number; distance: number; byres: boolean; }

function naviCtxAround(ctx: WorkerContext, args: NaviCtxAroundArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const prevSelStr = vsm.obj.sel.toString();
    if (!prevSelStr) return { ok: false };
    withUndoTxn(vsm.scene, 'Around mol selection', () => {
        applyMolSel(ctx, vsm.obj, rewriteAround(prevSelStr, args.distance, args.byres), vsm.scene.uid);
    });
    return { ok: true };
}

export const services = {
    naviCenterAt,
    naviCenterAtSymm,
    naviCtxSelect,
    naviCtxAddSelect,
    naviCtxUnselect,
    naviCtxInvertSel,
    naviCtxToggleSidechain,
    naviCtxAround,
};
