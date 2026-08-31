// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Lasso (freeform polygon) selection -- a tritium extension (not in UXP).
// The polygon vertices are handed to C++ `View.hitTestPolygon`, which gathers
// the bounding-box candidates with the same pick machinery as the rectangle
// tool and keeps the ones projecting inside the polygon. The vertices travel as
// a FLOAT32 ByteArray [x0,y0,x1,y1,...] (zero-copy, via ctx.svc.fromTypedArray),
// and the result JSON has the same shape as hitTestRect, so the grouping /
// assignment / undo-txn tail is shared with rectSelect.

import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getViewSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import {
    applySelectionHits,
    parseSelectionHits,
    type SelectionResult,
} from '@renderer/worker/server/services/select/applySelectionHits';

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

export type LassoSelectResult = SelectionResult;

export function lassoSelect(ctx: WorkerContext, args: LassoSelectArgs): LassoSelectResult {
    const pts = args.points;
    if (!pts || pts.length < 3) return { ok: false, selectedObjIds: [] };

    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return { ok: false, selectedObjIds: [] };
    const { view, scene } = vs;

    // Interleave the vertices into a FLOAT32 array and hand it to C++ as a
    // zero-copy ByteArray.
    const coords = new Float32Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) {
        coords[i * 2] = pts[i].x;
        coords[i * 2 + 1] = pts[i].y;
    }
    const ba = ctx.svc.fromTypedArray(coords) as ByteArray | null;
    if (!ba) return { ok: false, selectedObjIds: [] };

    const hits = parseSelectionHits(view.hitTestPolygon(ba, false));
    if (hits.length === 0) return { ok: false, selectedObjIds: [] };

    return applySelectionHits(ctx, scene, hits, args.mode);
}
