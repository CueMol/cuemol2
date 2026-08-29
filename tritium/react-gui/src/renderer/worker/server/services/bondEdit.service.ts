/**
 * @file worker/server/services/bondEdit.service.ts
 * @description Worker-side services for the bond-editor tool. Ports the UXP
 * `bond-edit-dlg.js` non-standard-bond editing, but replaces the modal /
 * atom-id-editbox workflow with an in-viewport two-pick gesture:
 *
 *   - bondEditPick:       a left click resolves an atom; the first pick is
 *                         remembered, the second pick (in the same molecule)
 *                         creates a bond between the two atoms.
 *   - bondEditReset:      cancel an in-progress pick sequence.
 *   - bondEditListBonds:  list a molecule's persistent (non-standard) bonds.
 *   - bondEditRemoveBond: remove one or more bonds (batched into one undo step).
 *
 * Runs in the Web Worker thread; C++ wrappers are synchronous (no await).
 *
 * The in-progress pick buffer lives here as module-level worker state -- the
 * worker is the single source of truth for the accumulated pick, never the
 * renderer. Bond creation / removal go through `MolAnlManager`, which records
 * its own undo `EditInfo` while a transaction is open, so the worker only opens
 * one `withUndoTxn` and never records undo itself.
 *
 * Atom-pick crosshair feedback reuses the same `DistPickDrawObj` the measure
 * tool uses: the two tools are never active at once (switching tools resets the
 * other's sequence), so sharing the per-view draw object is safe.
 */
import type { WorkerContext } from '../types/WorkerContext';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MsgLog } from '@cuemol/core/src/wrappers/MsgLog';
import type { DistPickDrawObj } from '@cuemol/core/src/wrappers/DistPickDrawObj';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolAnlManager } from '@cuemol/core/src/wrappers/MolAnlManager';
import type { HitTestResult } from '@renderer/types';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';

/** One picked atom: the molecule object uid and the atom id within it. */
interface PickedAtom {
    objId: number;
    atomId: number;
}

/** In-progress pick sequence for a single view (at most one pending atom). */
interface BondEditBuffer {
    picks: PickedAtom[];
}

// Per-view pick buffer keyed by viewId. Module-level worker state; the renderer
// never holds the pick (it only triggers picks and reads the count back).
const bondBuffers = new Map<number, BondEditBuffer>();

/**
 * One atom in a non-standard bond, as emitted by
 * `MolAnlManager.getNostdBondsJSON` (C++ `getAtomJSON`). `resid` is a string
 * (it may carry an insertion code); `altc` is present only for alt-conf atoms.
 */
export interface BondAtomJSON {
    aid: number;
    chain: string;
    resid: string;
    resn: string;
    aname: string;
    altc?: string;
}

/** A non-standard bond: the pair of atoms it connects (aid0 < aid1). */
export type BondAtomPair = [BondAtomJSON, BondAtomJSON];

// ---- internal helpers ----

function hitTestOnView(view: GUIView, x: number, y: number): HitTestResult | null {
    const sres = view.hitTest(x, y);
    if (!sres) return null;
    try {
        return JSON.parse(sres) as HitTestResult;
    } catch {
        return null;
    }
}

function writeMsgLog(ctx: WorkerContext, message: string): void {
    const msgLog = ctx.svc.getService('MsgLog') as MsgLog;
    if (!msgLog) return;
    msgLog.writeln(message);
}

function getAnlMgr(ctx: WorkerContext): MolAnlManager {
    return ctx.svc.getService('MolAnlManager') as MolAnlManager;
}

/**
 * Show a crosshair marker at the picked atom via the view's DistPickDrawObj.
 * The draw object stores 3D atom positions and re-projects every frame, so the
 * marker stays anchored to the atom when the camera rotates / translates
 * between the two picks (unlike a 2D screen overlay).
 */
function appendPickFeedback(view: GUIView, objId: number, atomId: number): void {
    const dobj = view.getDrawObj('DistPickDrawObj') as DistPickDrawObj;
    if (!dobj) return;
    dobj.enabled = true;
    dobj.append(objId, atomId);
    view.invalidate();
}

/**
 * Clear the pick crosshairs. Disabling the draw object clears its accumulated
 * positions (C++ setEnabled(false) empties the buffer) and stops it rendering;
 * the next pick re-enables it via appendPickFeedback.
 */
function clearPickFeedback(view: GUIView): void {
    const dobj = view.getDrawObj('DistPickDrawObj') as DistPickDrawObj;
    if (!dobj) return;
    dobj.enabled = false;
    view.invalidate();
}

function resetBuffer(viewId: number, view: GUIView | null): void {
    bondBuffers.delete(viewId);
    if (view) clearPickFeedback(view);
}

// ---- service: bondEditPick (left click -- hittest + accumulate / create) ----

export interface BondEditPickArgs {
    viewId: number;
    x: number;
    y: number;
}

export interface BondEditPickResult {
    /** True when the click resolved to an atom (or a handled rejection). */
    handled: boolean;
    /** Atoms picked so far in the current sequence (0 or 1; 0 after a bond is made). */
    picked: number;
    /** True when this pick completed the sequence (bond created), so the UI can refetch. */
    done?: boolean;
    statusMessage?: string;
}

function bondEditPick(ctx: WorkerContext, args: BondEditPickArgs): BondEditPickResult {
    let buf = bondBuffers.get(args.viewId);
    if (!buf) {
        buf = { picks: [] };
        bondBuffers.set(args.viewId, buf);
    }

    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!view) return { handled: false, picked: buf.picks.length };

    const raw = hitTestOnView(view, args.x, args.y);
    if (!raw || raw.objtype !== 'MolCoord') {
        // Missed click: keep any pending first pick so the user can retry.
        return { handled: false, picked: buf.picks.length };
    }

    // First pick: remember it and wait for the second atom.
    if (buf.picks.length === 0) {
        buf.picks.push({ objId: raw.obj_id, atomId: raw.atom_id });
        appendPickFeedback(view, raw.obj_id, raw.atom_id);
        const msg = `1 atom ([${raw.obj_name}] ${raw.message}) picked -- pick the second atom`;
        writeMsgLog(ctx, msg);
        return { handled: true, picked: 1, statusMessage: msg };
    }

    // Second pick: validate against the first. Rejections keep the first pick so
    // the user can immediately click a valid second atom (no re-pick needed).
    const first = buf.picks[0];
    if (raw.obj_id !== first.objId) {
        const msg = 'A bond must connect two atoms in the same molecule.';
        return { handled: true, picked: 1, statusMessage: msg };
    }
    if (raw.atom_id === first.atomId) {
        const msg = 'Cannot bond an atom to itself -- pick a different second atom.';
        return { handled: true, picked: 1, statusMessage: msg };
    }

    // Valid pair: create the bond on the shared molecule in one undo step.
    // MolAnlManager.makeBond records its own undo EditInfo inside the txn.
    const scene = view.getScene();
    const mol = scene.getObject(first.objId) as MolCoord;
    if (!mol) {
        resetBuffer(args.viewId, view);
        return { handled: true, picked: 0, done: true, statusMessage: 'Bond edit: molecule not found.' };
    }

    let message: string;
    try {
        const mgr = getAnlMgr(ctx);
        withUndoTxn(scene, 'Add bond', () => {
            mgr.makeBond(mol, first.atomId, raw.atom_id);
        });
        message = 'Bond added.';
    } catch {
        // C++ throw strings are copy-paste mislabeled ('removeBond:' inside
        // makeBond); never surface them. withUndoTxn already rolled back.
        message = 'Failed to add bond.';
    }

    resetBuffer(args.viewId, view);
    writeMsgLog(ctx, message);
    return { handled: true, picked: 0, done: true, statusMessage: message };
}

// ---- service: bondEditReset (cancel an in-progress pick sequence) ----

export interface BondEditResetArgs {
    viewId: number;
}

export interface BondEditResetResult {
    ok: boolean;
    /** True if a sequence with a pending first pick was actually cleared. */
    cleared: boolean;
}

function bondEditReset(ctx: WorkerContext, args: BondEditResetArgs): BondEditResetResult {
    const buf = bondBuffers.get(args.viewId);
    const cleared = buf != null && buf.picks.length > 0;
    const view = ctx.sceMgr.getView(args.viewId) as GUIView | null;
    resetBuffer(args.viewId, view);
    return { ok: true, cleared };
}

// ---- service: bondEditListBonds (a molecule's persistent bonds) ----

export interface BondEditListBondsArgs {
    sceneId: number;
    molId: number;
}

export interface BondEditListBondsResult {
    bonds: BondAtomPair[];
}

function bondEditListBonds(ctx: WorkerContext, args: BondEditListBondsArgs): BondEditListBondsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { bonds: [] };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { bonds: [] };

    try {
        const json = getAnlMgr(ctx).getNostdBondsJSON(mol);
        const parsed = JSON.parse(json) as BondAtomPair[];
        return { bonds: Array.isArray(parsed) ? parsed : [] };
    } catch {
        return { bonds: [] };
    }
}

// ---- service: bondEditRemoveBond (delete bonds, one undo step) ----

export interface BondEditRemoveBondArgs {
    sceneId: number;
    molId: number;
    /** Atom-id pairs to unbond. Batched into a single undo transaction. */
    pairs: [number, number][];
}

export interface BondEditRemoveBondResult {
    ok: boolean;
    removed: number;
}

function bondEditRemoveBond(ctx: WorkerContext, args: BondEditRemoveBondArgs): BondEditRemoveBondResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, removed: 0 };
    const mol = scene.getObject(args.molId) as MolCoord | null;
    if (!mol) return { ok: false, removed: 0 };
    if (args.pairs.length === 0) return { ok: true, removed: 0 };

    let removed = 0;
    try {
        const mgr = getAnlMgr(ctx);
        withUndoTxn(scene, 'Remove bond(s)', () => {
            for (const [aid1, aid2] of args.pairs) {
                mgr.removeBond(mol, aid1, aid2);
                removed += 1;
            }
        });
    } catch {
        return { ok: false, removed: 0 };
    }
    writeMsgLog(ctx, `Removed ${removed} bond(s).`);
    return { ok: true, removed };
}

// ---- registration ----

export const services = {
    bondEditPick,
    bondEditReset,
    bondEditListBonds,
    bondEditRemoveBond,
};
