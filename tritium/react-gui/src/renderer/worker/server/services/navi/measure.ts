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
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MsgLog } from '@cuemol/core/src/wrappers/MsgLog';
import type { DistPickDrawObj } from '@cuemol/core/src/wrappers/DistPickDrawObj';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { HitTestResult } from '@renderer/types';
import {
    ATOMINTR_TYPE,
    appendMeasureLabel,
    hasDegenerateAtoms,
    measureAtomCount,
    measureLabelNoun,
    type MeasureMode,
} from '@renderer/worker/server/services/helpers/atomintr';

export type { MeasureMode };

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
 * Clear the pick crosshairs. Disabling the draw object clears its accumulated
 * positions (C++ setEnabled(false) empties the buffer) and stops it rendering;
 * the next pick re-enables it via appendPickFeedback. Used both when a sequence
 * completes and when a sequence is reset/canceled.
 */
function clearPickFeedback(view: GUIView): void {
    const dobj = view.getDrawObj('DistPickDrawObj') as DistPickDrawObj;
    if (!dobj) return;
    dobj.enabled = false;
    view.invalidate();
}

/**
 * Create the measure label from a completed pick sequence.
 *
 * The renderer is created on (or reused from) the first pick's molecule; the
 * shared helper owns that and the undo transaction, so the mouse tool and the
 * AI agent's `measure_geometry` draw into the same label set.
 */
function defineMeasureLabel(view: GUIView, buf: PickBuffer, target: string | undefined): string {
    if (hasDegenerateAtoms(buf.mode, buf.picks)) {
        return 'Atom pick canceled (same atom).';
    }

    const scene = view.getScene();
    const mol = scene.getObject(buf.picks[0].objId) as MolCoord;
    if (!mol) return 'Measure: target molecule not found.';

    appendMeasureLabel(scene, mol, buf.mode, buf.picks, target ?? '');
    return `${measureLabelNoun(buf.mode)} label is defined.`;
}

// ---- service: measurePick (left click -- hittest + accumulate) ----

export interface MeasurePickArgs {
    viewId: number;
    x: number;
    y: number;
    mode: MeasureMode;
    /**
     * Name of the atomintr renderer to append labels to. Labels reuse (or
     * create) a renderer with this name on the target molecule; when empty the
     * default name ("measure") is used. Mirrors the UXP target list.
     */
    target?: string;
}

export interface MeasurePickResult {
    handled: boolean;
    /** Number of atoms picked so far in the current sequence (0 after completion). */
    picked: number;
    /** True when this pick completed a sequence and a label was created/canceled. */
    done?: boolean;
    statusMessage?: string;
}

export function measurePick(ctx: WorkerContext, args: MeasurePickArgs): MeasurePickResult {
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
    if (buf.picks.length >= measureAtomCount(buf.mode)) {
        const message = defineMeasureLabel(view, buf, args.target);
        buf.picks = [];
        clearPickFeedback(view);
        writeMsgLog(ctx, message);
        return { handled: true, picked: 0, done: true, statusMessage: message };
    }

    const msg = `${buf.picks.length} atom ([${raw.obj_name}] ${raw.message}) picked`;
    writeMsgLog(ctx, msg);
    return { handled: true, picked: buf.picks.length, statusMessage: msg };
}

// ---- service: measureReset (cancel an in-progress pick sequence) ----

export interface MeasureResetArgs {
    viewId: number;
}

export interface MeasureResetResult {
    ok: boolean;
    /** True if a sequence with at least one pick was actually cleared. */
    cleared: boolean;
}

export function measureReset(ctx: WorkerContext, args: MeasureResetArgs): MeasureResetResult {
    const buf = pickBuffers.get(args.viewId);
    const cleared = buf != null && buf.picks.length > 0;
    pickBuffers.delete(args.viewId);

    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (view) clearPickFeedback(view);

    return { ok: true, cleared };
}

// ---- service: measureListTargets (existing atomintr renderer names) ----

/** Minimal shape of a renderer entry in Scene.getSceneDataJSON(). */
interface RawRend {
    name?: string;
    type?: string;
    childNodes?: RawRend[];
}

function collectAtomIntrNames(rends: RawRend[] | undefined, out: Set<string>): void {
    if (!rends) return;
    for (const r of rends) {
        if (r.type === ATOMINTR_TYPE && r.name) out.add(r.name);
        if (r.childNodes) collectAtomIntrNames(r.childNodes, out);
    }
}

export interface MeasureListTargetsArgs {
    viewId: number;
}

export interface MeasureListTargetsResult {
    /** Sorted, unique names of existing atomintr renderers in the scene. */
    names: string[];
}

export function measureListTargets(ctx: WorkerContext, args: MeasureListTargetsArgs): MeasureListTargetsResult {
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!view) return { names: [] };

    const scene = view.getScene();
    let parsed: unknown;
    try {
        parsed = JSON.parse(scene.getSceneDataJSON());
    } catch {
        return { names: [] };
    }
    if (!Array.isArray(parsed)) return { names: [] };

    const names = new Set<string>();
    // parsed[0] is the scene node; objects follow.
    for (let i = 1; i < parsed.length; i++) {
        const obj = parsed[i] as { rends?: RawRend[] };
        collectAtomIntrNames(obj?.rends, names);
    }
    return { names: [...names].sort() };
}

// ---- registration ----
