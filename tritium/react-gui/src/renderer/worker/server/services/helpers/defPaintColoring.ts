/**
 * @file worker/server/services/helpers/defPaintColoring.ts
 * @description The app's default Paint coloring -- a `PaintColoring` seeded
 * with the four secondary-structure entries UXP `createDefPaintColoring`
 * (`renderer.js`) builds.
 *
 * Two call sites share it, which is why it lives here rather than beside
 * either: the post-load hook that paints a freshly-created molecule
 * (`molPostProc`), and the Coloring panel / renderer menu's "Paint coloring"
 * -> Default item (`setRendererColoring` with `paint-type-paint`). Building a
 * bare `PaintColoring` there instead left the paint table empty, so the entry
 * looked like it had done nothing.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { WorkerContext } from '../../types/WorkerContext';
import { makeSel } from './makeSel';
import { makeColor } from './makeColor';

/** Selection -> colour rows of the default painting, in UXP's order. */
const DEFAULT_PAINT_ENTRIES: { sel: string; color: string }[] = [
    { sel: 'sheet', color: 'SteelBlue' },
    { sel: 'helix', color: 'khaki' },
    { sel: 'nucleic', color: 'yellow' },
    { sel: '*', color: 'FloralWhite' },
];

/**
 * Build a `PaintColoring` carrying the default painting.
 *
 * @param ctx - worker context.
 * @param sceneUid - scene scope for compiling the selections / named colours;
 *   omit (0) for the global scope.
 * @returns the coloring, or null when the object or any selection could not be
 *   built (the caller then leaves the renderer's coloring alone).
 */
export function createDefPaintColoring(
    ctx: WorkerContext,
    sceneUid = 0,
): PaintColoring | null {
    const coloring = ctx.svc.createObj('PaintColoring') as PaintColoring;
    if (!coloring) return null;
    for (const entry of DEFAULT_PAINT_ENTRIES) {
        const sel = makeSel(ctx, entry.sel, sceneUid);
        if (!sel) return null;
        coloring.append(sel, makeColor(ctx, entry.color, sceneUid));
    }
    return coloring;
}
