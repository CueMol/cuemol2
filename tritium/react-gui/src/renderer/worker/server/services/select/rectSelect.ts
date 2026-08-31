// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Rectangle (rubber-band) selection backend. Mirrors UXP
// `navi-toolribbon.js` rectSel(): hit-test the dragged rectangle, group the
// hits by molecule object, and replace each molecule's selection with the
// union of the matched atoms. The grouping / assignment / undo-txn tail is
// shared with lassoSelect (see ./applySelectionHits).

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getViewSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import {
    applySelectionHits,
    parseSelectionHits,
    type SelectionResult,
} from '@renderer/worker/server/services/select/applySelectionHits';

export interface RectSelectArgs {
    viewId: number;
    /** Rectangle bounds in canvas-local logical pixels (same space as hitTest). */
    left: number;
    top: number;
    width: number;
    height: number;
    /**
     * 'replace' (default) overwrites each molecule's selection with the
     * rectangle hits; 'add' ORs the hits with the existing selection
     * (Shift+drag -- a tritium extension not present in UXP).
     */
    mode?: 'replace' | 'add';
}

export type RectSelectResult = SelectionResult;

/**
 * Hit-test the dragged rectangle and replace the selection of each matched
 * molecule. `bNearest=false` returns every hit inside the rectangle.
 */
export function rectSelect(ctx: WorkerContext, args: RectSelectArgs): RectSelectResult {
    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return { ok: false, selectedObjIds: [] };
    const { view, scene } = vs;

    const hits = parseSelectionHits(
        view.hitTestRect(args.left, args.top, args.width, args.height, false),
    );
    if (hits.length === 0) return { ok: false, selectedObjIds: [] };

    return applySelectionHits(ctx, scene, hits, args.mode);
}
