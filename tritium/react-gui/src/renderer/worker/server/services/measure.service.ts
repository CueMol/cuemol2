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
 * renderer. Label creation and the crosshair feedback are added in later
 * milestones; this milestone only resolves clicks to atoms and accumulates.
 */
import type { WorkerContext } from '../types/WorkerContext';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MsgLog } from '@cuemol/core/src/wrappers/MsgLog';
import type { HitTestResult } from '../../../types';

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

function writeMsgLog(ctx: WorkerContext, message: string): void {
    const msgLog = ctx.svc.getService('MsgLog') as MsgLog;
    if (!msgLog) return;
    msgLog.writeln(message);
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
    /** Number of atoms picked so far in the current sequence. */
    picked: number;
    statusMessage?: string;
}

function measurePick(ctx: WorkerContext, args: MeasurePickArgs): MeasurePickResult {
    const raw = runHitTest(ctx, args.viewId, args.x, args.y);

    // Re-fetch (or start) the buffer; switching sub-mode restarts the sequence.
    let buf = pickBuffers.get(args.viewId);
    if (!buf || buf.mode !== args.mode) {
        buf = { mode: args.mode, picks: [] };
        pickBuffers.set(args.viewId, buf);
    }

    if (!raw || raw.objtype !== 'MolCoord') {
        return { handled: false, picked: buf.picks.length };
    }

    buf.picks.push({ objId: raw.obj_id, atomId: raw.atom_id });

    const msg = `${buf.picks.length} atom ([${raw.obj_name}] ${raw.message}) picked`;
    writeMsgLog(ctx, msg);
    return { handled: true, picked: buf.picks.length, statusMessage: msg };
}

// ---- registration ----

export const services = {
    measurePick,
};
