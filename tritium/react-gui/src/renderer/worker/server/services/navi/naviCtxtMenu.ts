// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolAtom } from '@cuemol/core/src/wrappers/MolAtom';
import type { SymmRenderer } from '@cuemol/core/src/wrappers/SymmRenderer';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { invertSelStr, rewriteAround, toggleSidechainStr } from '@renderer/worker/server/services/helpers/selStrTransforms';
import { getViewSceneOrNull, getViewSceneObjOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { withUndoTxn } from '../withUndoTxn';
import { quoteSelName } from '@renderer/worker/server/services/helpers/selName';

/**
 * Granularity of an atom context-menu selection. Canonical source for the
 * `mode` field carried by the `naviCtxSelect` / `naviCtxAddSelect` services
 * (used to be inline-duplicated across the renderer-side facade).
 */
export type SelectMode = 'atom' | 'residue' | 'chain' | 'mol';

/**
 * Result of a context-menu service that writes `mol.sel`. `selStr` is the
 * expression the service built and applied, returned so the renderer can
 * record it in the selection history (the worker has no localStorage).
 */
export interface NaviCtxSelResult {
    ok: boolean;
    selStr?: string;
}

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

    // A chain name reaches the selection grammar as a literal, so it has to be
    // quoted: mmCIF auth_asym_id may contain a space, which would otherwise
    // parse as a different expression. quoteSelName returns null for a name the
    // grammar cannot represent at all.
    const chain = quoteSelName(chainName);
    if (!chain) return null;

    switch (mode) {
        case 'atom':     return `aid ${atomId}`;
        case 'residue':  return `${chain}.${residIndex}.*`;
        case 'chain':    return `c;${chain}`;
        case 'mol':      return '*';
    }
}

// ---- services ----

export interface NaviCenterAtArgs { viewId: number; x: number; y: number; z: number; }

export function naviCenterAt(ctx: WorkerContext, args: NaviCenterAtArgs): { ok: boolean } {
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

export function naviCenterAtSymm(ctx: WorkerContext, args: NaviCenterAtSymmArgs): { ok: boolean } {
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

export function naviCtxSelect(ctx: WorkerContext, args: NaviCtxSelectArgs): NaviCtxSelResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const selStr = buildSelStr(vsm.obj, args.atomId, args.mode);
    if (!selStr) return { ok: false };
    withUndoTxn(vsm.scene, 'Select atom(s)', () => {
        applyMolSel(ctx, vsm.obj, selStr, vsm.scene.uid);
    });
    return { ok: true, selStr };
}

export function naviCtxAddSelect(ctx: WorkerContext, args: NaviCtxSelectArgs): NaviCtxSelResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const newSelStr = buildSelStr(vsm.obj, args.atomId, args.mode);
    if (!newSelStr) return { ok: false };
    const prevSelStr = vsm.obj.sel.toString();
    const selStr = prevSelStr ? `(${prevSelStr}) or (${newSelStr})` : newSelStr;
    withUndoTxn(vsm.scene, 'Add select atom(s)', () => {
        applyMolSel(ctx, vsm.obj, selStr, vsm.scene.uid);
    });
    return { ok: true, selStr };
}

export interface NaviCtxObjArgs { viewId: number; objId: number; }

export function naviCtxUnselect(ctx: WorkerContext, args: NaviCtxObjArgs): { ok: boolean } {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    withUndoTxn(vsm.scene, 'Unselect molecule', () => {
        applyMolSel(ctx, vsm.obj, '', vsm.scene.uid);
    });
    return { ok: true };
}

export function naviCtxInvertSel(ctx: WorkerContext, args: NaviCtxObjArgs): NaviCtxSelResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const selStr = invertSelStr(vsm.obj.sel.toString());
    withUndoTxn(vsm.scene, 'Invert mol selection', () => {
        applyMolSel(ctx, vsm.obj, selStr, vsm.scene.uid);
    });
    return { ok: true, selStr };
}

export function naviCtxToggleSidechain(ctx: WorkerContext, args: NaviCtxObjArgs): NaviCtxSelResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const prevSelStr = vsm.obj.sel.toString();
    if (!prevSelStr) return { ok: false };
    const selStr = toggleSidechainStr(prevSelStr);
    withUndoTxn(vsm.scene, 'Toggle bysidech', () => {
        applyMolSel(ctx, vsm.obj, selStr, vsm.scene.uid);
    });
    return { ok: true, selStr };
}

export interface NaviCtxAroundArgs { viewId: number; objId: number; distance: number; byres: boolean; }

export function naviCtxAround(ctx: WorkerContext, args: NaviCtxAroundArgs): NaviCtxSelResult {
    const vsm = getViewSceneObjOrNull<MolCoord>(ctx, args.viewId, args.objId);
    if (!vsm) return { ok: false };
    const prevSelStr = vsm.obj.sel.toString();
    if (!prevSelStr) return { ok: false };
    const selStr = rewriteAround(prevSelStr, args.distance, args.byres);
    withUndoTxn(vsm.scene, 'Around mol selection', () => {
        applyMolSel(ctx, vsm.obj, selStr, vsm.scene.uid);
    });
    return { ok: true, selStr };
}
