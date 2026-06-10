/**
 * @file worker/server/services/measure.service.ts
 * @description Worker-side services for the measure (distance / angle /
 * torsion) tool. Ports the UXP `measure-toolribbon.js` pick state machine:
 * the user clicks atoms in sequence and a geometric label is created on the
 * target molecule once enough atoms are picked.
 *
 * Runs in the Web Worker thread; C++ wrappers are synchronous (no await).
 *
 * The in-progress pick buffer lives here as module-level worker state -- the
 * worker is the single source of truth for the accumulated picks, never the
 * renderer. When enough atoms are picked (2 / 3 / 4) the geometric label is
 * created on the first pick's molecule via the atomintr renderer, wrapped in an
 * undo transaction, and the pick sequence (and crosshair feedback) is reset.
 */
import type { WorkerContext } from '../types/WorkerContext';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MsgLog } from '@cuemol/core/src/wrappers/MsgLog';
import type { DistPickDrawObj } from '@cuemol/core/src/wrappers/DistPickDrawObj';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { AtomIntrRenderer } from '@cuemol/core/src/wrappers/AtomIntrRenderer';
import type { HitTestResult } from '../../../types';
import { withUndoTxn } from './withUndoTxn';

/** Renderer type name for distance / angle / torsion labels (UXP parity). */
const ATOMINTR_TYPE = 'atomintr';
/** Default styles applied to a freshly created atomintr renderer (UXP parity). */
const ATOMINTR_STYLES = 'DefaultLabel,DefaultAtomIntr';

/**
 * Measure sub-mode. The required number of atom picks is 2 / 3 / 4 for
 * distance / angle / torsion respectively.
 */
export type MeasureMode = 'distance' | 'angle' | 'torsion';

/** One picked atom: the molecule object uid and the atom id within it. */
interface PickedAtom {
    objId: number;
    atomId: number;
}

/** In-progress pick sequence for a single view. */
interface PickBuffer {
    mode: MeasureMode;
    picks: PickedAtom[];
}

// Per-view pick buffer keyed by viewId. Module-level worker state; the
// renderer never holds the picks (it only triggers picks and reads counts).
const pickBuffers = new Map<number, PickBuffer>();

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

/**
 * Show a crosshair marker at the picked atom via the view's DistPickDrawObj.
 * The draw object stores 3D atom positions and re-projects every frame, so the
 * markers stay anchored to the atoms when the camera rotates / translates
 * between picks (unlike a 2D screen overlay). `getDrawObj` lazily creates and
 * caches the draw object; setting `enabled` makes the view render it.
 */
function appendPickFeedback(view: GUIView, objId: number, atomId: number): void {
    const dobj = view.getDrawObj('DistPickDrawObj') as DistPickDrawObj;
    if (!dobj) return;
    dobj.enabled = true;
    dobj.append(objId, atomId);
    view.invalidate();
}

/**
 * Clear the pick crosshairs after a sequence completes. Disabling the draw
 * object clears its accumulated positions (C++ setEnabled(false) empties the
 * buffer); re-enabling keeps it ready for the next sequence. Mirrors the UXP
 * reset() toggle.
 */
function clearPickFeedback(view: GUIView): void {
    const dobj = view.getDrawObj('DistPickDrawObj') as DistPickDrawObj;
    if (!dobj) return;
    dobj.enabled = false;
    dobj.enabled = true;
    view.invalidate();
}

/** Number of atom picks a mode needs before its label is created. */
function pickCountFor(mode: MeasureMode): number {
    if (mode === 'distance') return 2;
    if (mode === 'angle') return 3;
    return 4;
}

/** Human-readable label noun used in status messages and the undo label. */
function labelNounFor(mode: MeasureMode): string {
    if (mode === 'distance') return 'Distance';
    if (mode === 'angle') return 'Angle';
    return 'Torsion';
}

/**
 * Reject degenerate picks (the same atom picked twice in a pair). Mirrors the
 * UXP defineDistLabel guard so a zero-length measurement is not created.
 */
function hasDegeneratePick(picks: PickedAtom[]): boolean {
    for (let i = 1; i < picks.length; i++) {
        const a = picks[i - 1];
        const b = picks[i];
        if (a.objId === b.objId && a.atomId === b.atomId) return true;
    }
    return false;
}

/**
 * Create the measure label from a completed pick sequence. The renderer is
 * created on (or reused from) the first pick's molecule; later atoms pass their
 * own object uid explicitly, so cross-molecule measurements work (UXP parity).
 * The whole create-or-reuse + append runs in one undo transaction.
 */
function defineMeasureLabel(view: GUIView, buf: PickBuffer): string {
    if (hasDegeneratePick(buf.picks)) {
        return 'Atom pick canceled (same atom).';
    }

    const scene = view.getScene();
    const mol = scene.getObject(buf.picks[0].objId) as MolCoord;
    if (!mol) return 'Measure: target molecule not found.';

    const noun = labelNounFor(buf.mode);
    withUndoTxn(scene, `Define ${noun} Label`, () => {
        let rend = mol.getRendererByType(ATOMINTR_TYPE) as AtomIntrRenderer | null;
        if (!rend) {
            rend = mol.createRenderer(ATOMINTR_TYPE) as AtomIntrRenderer;
            rend.applyStyles(ATOMINTR_STYLES);
        }
        const p = buf.picks;
        if (buf.mode === 'distance') {
            rend.appendById(p[0].atomId, p[1].objId, p[1].atomId, true);
        }
        // angle / torsion are added in a later milestone.
    });

    return `${noun} label is defined.`;
}

// ---- service: measurePick (left click -- hittest + accumulate) ----

export interface MeasurePickArgs {
    viewId: number;
    x: number;
    y: number;
    mode: MeasureMode;
}

export interface MeasurePickResult {
    handled: boolean;
    /** Number of atoms picked so far in the current sequence (0 after completion). */
    picked: number;
    /** True when this pick completed a sequence and a label was created/canceled. */
    done?: boolean;
    statusMessage?: string;
}

function measurePick(ctx: WorkerContext, args: MeasurePickArgs): MeasurePickResult {
    // Re-fetch (or start) the buffer; switching sub-mode restarts the sequence.
    let buf = pickBuffers.get(args.viewId);
    if (!buf || buf.mode !== args.mode) {
        buf = { mode: args.mode, picks: [] };
        pickBuffers.set(args.viewId, buf);
    }

    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!view) return { handled: false, picked: buf.picks.length };

    const raw = hitTestOnView(view, args.x, args.y);
    if (!raw || raw.objtype !== 'MolCoord') {
        return { handled: false, picked: buf.picks.length };
    }

    buf.picks.push({ objId: raw.obj_id, atomId: raw.atom_id });
    appendPickFeedback(view, raw.obj_id, raw.atom_id);

    // Sequence complete: create the label, then reset picks and crosshairs.
    if (buf.picks.length >= pickCountFor(buf.mode)) {
        const message = defineMeasureLabel(view, buf);
        buf.picks = [];
        clearPickFeedback(view);
        writeMsgLog(ctx, message);
        return { handled: true, picked: 0, done: true, statusMessage: message };
    }

    const msg = `${buf.picks.length} atom ([${raw.obj_name}] ${raw.message}) picked`;
    writeMsgLog(ctx, msg);
    return { handled: true, picked: buf.picks.length, statusMessage: msg };
}

// ---- registration ----

export const services = {
    measurePick,
};
