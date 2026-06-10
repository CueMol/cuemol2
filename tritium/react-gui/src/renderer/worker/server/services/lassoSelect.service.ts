// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Lasso (freeform polygon) selection -- a tritium extension (not in UXP).
// Strategy: hit-test the polygon's bounding box to get the visible candidate
// atoms (reusing the rectangle hit test), then keep only those whose screen
// projection falls inside the lasso polygon. Projection uses the C++
// `View.projToScreen`, so it matches the camera exactly (ortho + perspective).

import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolAtom } from '@cuemol/core/src/wrappers/MolAtom';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { WorkerContext } from '../types/WorkerContext';
import { getViewSceneOrNull } from './helpers/sceneResolver';
import { makeSel } from './helpers/makeSel';
import { withUndoTxn } from './withUndoTxn';

export interface LassoPoint {
    x: number;
    y: number;
}

export interface LassoSelectArgs {
    viewId: number;
    /** Lasso polygon vertices in canvas-local logical pixels. */
    points: LassoPoint[];
    /** 'add' (Shift) ORs with the existing selection; default 'replace'. */
    mode?: 'replace' | 'add';
}

export interface LassoSelectResult {
    ok: boolean;
    selectedObjIds: number[];
}

/** One element of the `View.hitTestRect` JSON array. */
interface RectHit {
    obj_id: number;
    sel: string;
}

/**
 * Parse a `"aid 5,7,10:15"` selection string into individual atom ids.
 * Ranges use `:` (see qlib::rangeToString); commas separate entries.
 */
function parseAids(sel: string): number[] {
    const idx = sel.indexOf('aid');
    const body = idx >= 0 ? sel.slice(idx + 3) : sel;
    const aids: number[] = [];
    for (const tok of body.split(',')) {
        const t = tok.trim();
        if (!t) continue;
        if (t.includes(':')) {
            const [a, b] = t.split(':').map((s) => parseInt(s, 10));
            if (Number.isFinite(a) && Number.isFinite(b)) {
                for (let i = a; i <= b; i++) aids.push(i);
            }
        } else {
            const a = parseInt(t, 10);
            if (Number.isFinite(a)) aids.push(a);
        }
    }
    return aids;
}

/** Ray-casting point-in-polygon test. */
function pointInPolygon(x: number, y: number, poly: LassoPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const intersect =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function bbox(points: LassoPoint[]): { x: number; y: number; w: number; h: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return {
        x: Math.round(minX),
        y: Math.round(minY),
        w: Math.round(maxX - minX),
        h: Math.round(maxY - minY),
    };
}

/** Assign `selStr` to `mol.sel`, auto-creating the `*selection` renderer. */
function assignMolSel(ctx: WorkerContext, mol: MolCoord, selStr: string, sceneUid: number): boolean {
    const sel = makeSel(ctx, selStr, sceneUid);
    if (sel === null) return false;
    if (!mol.getRendererByType('*selection')) {
        mol.createRenderer('*selection');
    }
    mol.sel = sel;
    return true;
}

function lassoSelect(ctx: WorkerContext, args: LassoSelectArgs): LassoSelectResult {
    const pts = args.points;
    if (!pts || pts.length < 3) return { ok: false, selectedObjIds: [] };

    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return { ok: false, selectedObjIds: [] };
    const view = vs.view as GUIView;
    const { scene } = vs;

    const bb = bbox(pts);
    if (bb.w <= 0 || bb.h <= 0) return { ok: false, selectedObjIds: [] };

    const sres = view.hitTestRect(bb.x, bb.y, bb.w, bb.h, false);
    if (!sres) return { ok: false, selectedObjIds: [] };

    let hits: RectHit[];
    try {
        hits = JSON.parse(sres) as RectHit[];
    } catch {
        return { ok: false, selectedObjIds: [] };
    }
    if (!Array.isArray(hits) || hits.length === 0) {
        return { ok: false, selectedObjIds: [] };
    }

    // Filter bounding-box candidates to those projecting inside the polygon.
    const keptByObj = new Map<number, number[]>();
    for (const hit of hits) {
        if (hit.obj_id == null || !hit.sel) continue;
        const mol = scene.getObject(hit.obj_id) as MolCoord | null;
        if (!mol) continue;
        const kept: number[] = [];
        for (const aid of parseAids(hit.sel)) {
            const atom = mol.getAtomByID(aid) as MolAtom | null;
            if (!atom) continue;
            const scr = view.projToScreen(atom.pos as Vector) as Vector;
            if (pointInPolygon(scr.x, scr.y, pts)) kept.push(aid);
        }
        if (kept.length > 0) keptByObj.set(hit.obj_id, kept);
    }
    if (keptByObj.size === 0) return { ok: false, selectedObjIds: [] };

    const addMode = args.mode === 'add';
    const selectedObjIds: number[] = [];
    withUndoTxn(scene, addMode ? 'Add select atom(s)' : 'Select atom(s)', () => {
        for (const [objId, aids] of keptByObj) {
            const mol = scene.getObject(objId) as MolCoord | null;
            if (!mol) continue;
            const newSelStr = `aid ${aids.join(',')}`;
            let selStr = newSelStr;
            if (addMode) {
                const prevSelStr = mol.sel.toString();
                if (prevSelStr) selStr = `(${prevSelStr}) or (${newSelStr})`;
            }
            if (assignMolSel(ctx, mol, selStr, scene.uid)) {
                selectedObjIds.push(objId);
            }
        }
    });

    return { ok: selectedObjIds.length > 0, selectedObjIds };
}

export const services = {
    lassoSelect,
};
