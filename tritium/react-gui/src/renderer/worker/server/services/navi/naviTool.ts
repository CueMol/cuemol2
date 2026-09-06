// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MsgLog } from '@cuemol/core/src/wrappers/MsgLog';
import type { NameLabelRenderer } from '@cuemol/core/src/wrappers/NameLabelRenderer';
import type { ResidRangeSet } from '@cuemol/core/src/wrappers/ResidRangeSet';
import type { MolResidue } from '@cuemol/core/src/wrappers/MolResidue';
import type { HitTestResult } from '@renderer/types';
import { withUndoTxn } from '../withUndoTxn';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { quoteSelName } from '@renderer/worker/server/services/helpers/selName';

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

function toggleAtomLabel(mol: MolCoord, atomId: number): void {
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
    const msgLog = ctx.svc.getService('MsgLog') as MsgLog;
    if (!msgLog) return;
    msgLog.writeln(message);
}

/** `Molecule [name], msg` for a MolCoord hit, `LWObject [name], msg` otherwise. */
function hitHeadline(raw: HitTestResult): string {
    const kind = raw.objtype === 'MolCoord' ? 'Molecule' : 'LWObject';
    return `${kind} [${raw.obj_name}], ${raw.message}`;
}

/** ` (symop: name)` for a hit through a `*symm` renderer, '' otherwise. */
function symopSuffix(raw: HitTestResult): string {
    if (raw.rendtype === '*symm' && raw.symm_name) return ` (symop: ${raw.symm_name})`;
    return '';
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

export function naviHitTest(ctx: WorkerContext, args: NaviHitTestArgs): NaviHitTestResult {
    const raw = runHitTest(ctx, args.viewId, args.x, args.y);
    if (!raw) return { hit: false };
    return { hit: true, raw };
}

// ---- service: naviClickAtom (left click -- hittest + log + atom label toggle) ----

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

export function naviClickAtom(ctx: WorkerContext, args: NaviClickAtomArgs): NaviClickAtomResult {
    const raw = runHitTest(ctx, args.viewId, args.x, args.y);
    if (!raw) return { handled: false };

    if (raw.objtype !== 'MolCoord') {
        const msg = hitHeadline(raw);
        writeMsgLog(ctx, msg);
        return { handled: true, statusMessage: msg, hitres: raw };
    }

    let statusMessage = hitHeadline(raw);
    statusMessage += `, O: ${raw.occ.toFixed(2)} B: ${raw.bfac.toFixed(2)}`;
    statusMessage += ` Pos: (${raw.x.toFixed(3)}, ${raw.y.toFixed(3)}, ${raw.z.toFixed(3)})`;
    statusMessage += symopSuffix(raw);

    writeMsgLog(ctx, statusMessage);

    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    const scene = view.getScene();
    const mol = scene.getObject(raw.obj_id) as MolCoord;
    if (mol) {
        withUndoTxn(scene, 'Add atom label', () => {
            toggleAtomLabel(mol, raw.atom_id);
        });
    }

    return { handled: true, statusMessage, hitres: raw };
}

// ---- service: naviHover (pointer hover -- hit test only, no log, no txn) ----

export interface NaviHoverArgs {
    viewId: number;
    /** Logical canvas pixels, the same space as a click. */
    x: number;
    y: number;
    /**
     * Also set / clear the view's hover highlight (GUIView.setHoverHit) from
     * the result, in the same worker round trip. Off leaves the highlight
     * state untouched.
     */
    highlight?: boolean;
}

export interface NaviHoverClearArgs {
    viewId: number;
}

/**
 * What is under the pointer, structured for the 3D view hover label.
 * Molecule hits carry the atom / residue identity; other objects only `text`.
 */
export interface HoverLabel {
    /** Object (molecule) name. */
    objName: string;
    /** Renderer name and type name (e.g. `cartoon`). */
    rendName: string;
    rendType: string;
    /** True when the hit renderer draws residues, not atoms (cartoon, tube,
     *  ...): the label then names the residue and omits the atom. */
    residueLevel: boolean;
    chain?: string;
    resName?: string;
    resIndex?: string;
    atomName?: string;
    /** Symmetry operator name for a hit through a `*symm` renderer. */
    symop?: string;
    /** Plain text for non-molecule hits (LWObject): the C++ hit message. */
    text?: string;
}

export interface NaviHoverResult {
    hit: boolean;
    label?: HoverLabel;
    raw?: HitTestResult;
}

/** Renderer types whose geometry belongs to residues rather than atoms. */
const RESIDUE_LEVEL_RENDTYPES: ReadonlySet<string> = new Set([
    'cartoon', 'ribbon', 'tube', 'spline', 'nucl', 'trace',
]);

function buildHoverLabel(ctx: WorkerContext, viewId: number, raw: HitTestResult): HoverLabel {
    const base: HoverLabel = {
        objName: raw.obj_name,
        rendName: raw.rend_name,
        rendType: raw.rendtype,
        residueLevel: RESIDUE_LEVEL_RENDTYPES.has(raw.rendtype),
    };
    if (raw.rendtype === '*symm' && raw.symm_name) base.symop = raw.symm_name;
    if (raw.objtype !== 'MolCoord') {
        base.text = raw.message;
        return base;
    }
    // Atom identity from the wrapper (chain / residue / atom names); fall back
    // to the C++ message text if the atom cannot be resolved.
    try {
        const view = ctx.sceMgr.getView(viewId) as GUIView;
        const mol = view.getScene().getObject(raw.obj_id) as MolCoord | null;
        const atom = mol ? mol.getAtomByID(raw.atom_id) : null;
        if (atom) {
            base.chain = String(atom.chainName);
            base.resName = String(atom.residName);
            base.resIndex = String(atom.residIndex);
            if (!base.residueLevel) base.atomName = String(atom.name);
            return base;
        }
    } catch {
        // fall through to the text form
    }
    base.text = raw.message;
    return base;
}

/**
 * Hit test under the pointer for the 3D view hover label. Read-only: no
 * MsgLog entry and no undo transaction, unlike naviClickAtom. A native throw
 * (e.g. a lost GL context) is reported as a miss, never as a rejection.
 */
export function naviHover(ctx: WorkerContext, args: NaviHoverArgs): NaviHoverResult {
    let raw: HitTestResult | null;
    try {
        raw = runHitTest(ctx, args.viewId, args.x, args.y);
    } catch {
        raw = null;
    }
    if (args.highlight) applyHoverHighlight(ctx, args.viewId, raw);
    if (!raw) return { hit: false };
    return { hit: true, label: buildHoverLabel(ctx, args.viewId, raw), raw };
}

/**
 * Push the hover result to the view's highlight state: a molecule hit
 * highlights that element (the view decides whether it can, e.g. only
 * GPU-picked renderers), anything else clears it. The view schedules its own
 * present-only frame; no redraw request here.
 */
function applyHoverHighlight(ctx: WorkerContext, viewId: number, raw: HitTestResult | null): void {
    const view = ctx.sceMgr.getView(viewId) as GUIView | null;
    if (!view) return;
    try {
        if (raw && raw.objtype === 'MolCoord') {
            view.setHoverHit(raw.rend_id, raw.atom_id, raw.symm_id ?? -1);
        } else {
            view.clearHoverHit();
        }
    } catch {
        // lost GL context / view being torn down: nothing to highlight
    }
}

/** Remove the hover highlight (pointer left the view, drag started, ...). */
export function naviHoverClear(ctx: WorkerContext, args: NaviHoverClearArgs): { ok: boolean } {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView | null;
    if (!view) return { ok: false };
    try {
        view.clearHoverHit();
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

// ---- service: naviResidSel (double click -- residue selection toggle/extend) ----

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
    /** The whole `mol.sel` after the toggle / extend (for the selection history). */
    selStr?: string;
}

export function naviResidSel(ctx: WorkerContext, args: NaviResidSelArgs): NaviResidSelResult {
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
    const chain = quoteSelName(chainName);
    if (!chain) return { handled: false };

    let selStr: string | undefined;
    withUndoTxn(scene, 'Toggle select atom(s)', () => {
        const rrs = ctx.svc.createObj('ResidRangeSet') as ResidRangeSet;
        rrs.fromSel(mol, mol.sel);

        if (args.mode === 'extend') {
            if (args.prevObjId !== raw.obj_id) return;
            if (args.prevAtomId == null) return;

            const prevAtom = mol.getAtomByID(args.prevAtomId);
            if (!prevAtom) return;
            if (prevAtom.chainName !== chainName) return;

            const prevResidIndex = prevAtom.residIndex;
            const addSel = makeSel(ctx, `${chain}.${prevResidIndex}:${residIndex}.*`, scene.uid);
            // A failed compile used to yield a match-nothing SelCommand that
            // was appended anyway, silently changing the selection.
            if (!addSel) return;
            rrs.append(mol, addSel);
        } else {
            const resid = mol.getResidue(chainName, residIndex) as MolResidue;
            const addSel = makeSel(ctx, `${chain}.${residIndex}.*`, scene.uid);
            if (!addSel) return;
            if (resid && rrs.contains(resid)) {
                rrs.remove(mol, addSel);
            } else {
                rrs.append(mol, addSel);
            }
        }

        const sel = rrs.toSel(mol);
        mol.sel = sel;
        selStr = String(sel.toString());
    });

    return { handled: true, objId: raw.obj_id, atomId: raw.atom_id, selStr };
}

// ---- registration ----
