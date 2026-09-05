/**
 * @file worker/server/services/map/props.ts
 * @description Writing a map renderer's settings.
 *
 * `redrawMapCenter` is here rather than in the panel because it is the same
 * edit seen from the other side: the displayed region follows the view, so
 * moving the camera has to move the map's centre for the contour to stay
 * where the user is looking.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull, getViewSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { undoTxnResult } from '../withUndoTxn';
import { ok, fail, failFrom, type Result } from '@renderer/worker/shared/result';
import { makeColor } from '@renderer/worker/server/services/helpers/makeColor';
import { safeRead } from './state';
import type {
    RedrawMapCenterArgs,
    SetMapRendererPropArgs,
    SetMapRendererPropResult,
} from './types';
export function setMapRendererProp(
    ctx: WorkerContext,
    args: SetMapRendererPropArgs,
): SetMapRendererPropResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail('scene not found', 'not-found');
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return fail('renderer not found', 'not-found');

    // `level` is the absolute-unit view of `siglevel` (nopersist, no default
    // of its own): the default flag that a restore has to put back is
    // siglevel's.
    const flagProp = args.propName === 'level' ? 'siglevel' : args.propName;

    // Live preview during a drag: numeric write without an undo txn (the view
    // still redraws via the prop-change event). `color` never previews.
    if (args.mode === 'preview' && args.propName !== 'color') {
        try {
            rend.setProp(args.propName, args.value);
        } catch (e) {
            return failFrom(e);
        }
        return ok();
    }

    // Drag cancelled: restore the pre-drag snapshot, txn-free. `resetProp`
    // reverts the default flag + value when the prop was default before the
    // drag, undoing the one-way flag flip a preview frame leaves behind.
    if (args.mode === 'abort' && args.propName !== 'color') {
        try {
            if (args.originalWasDefault) rend.resetProp(flagProp);
            else rend.setProp(args.propName, args.value);
        } catch (e) {
            return failFrom(e);
        }
        return ok();
    }

    // Realtime commit: restore the pre-drag state first (txn-free, not
    // recorded) so the single undo step is `originalValue -> value`. When the
    // prop was default, restore via `resetProp` (flag + value) so the in-txn
    // `setProp` re-trips the default -> non-default transition and undo reverts
    // the default state too.
    if (args.originalValue !== undefined && args.propName !== 'color') {
        try {
            if (args.originalWasDefault) rend.resetProp(flagProp);
            else rend.setProp(args.propName, args.originalValue);
        } catch (e) {
            return failFrom(e);
        }
    }
    // The in-txn write is a void mutation: a throw rolls back (no commit).
    return undoTxnResult(scene as Scene, 'Change map renderer prop', () => {
        if (args.propName === 'color') {
            // Use the typed property setter (same path as
            // `setRendererDefaultColor`): the wrapper layer
            // unwraps the AbstractColor for the C++ side, which is
            // what triggers the renderer's PROPCHG -> redraw path.
            const color = makeColor(ctx, String(args.value), scene.uid);
            (rend as unknown as { color: AbstractColor }).color = color;
        } else {
            rend.setProp(args.propName, args.value);
        }
        return ok();
    });
}

export type RedrawMapCenterResult = Result<{
    /** True iff a center change was actually applied (false on small-movement guard). */
    moved: boolean;
}>;

/**
 * Set the map renderer's `center` to the current view center, unless
 * the new center is within 0.1 A of the existing one (UXP small-movement
 * guard from `denmap.onRedraw`).
 */
export function redrawMapCenter(
    ctx: WorkerContext,
    args: RedrawMapCenterArgs,
): RedrawMapCenterResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail('scene not found', 'not-found');
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return fail('renderer not found', 'not-found');

    const vs = getViewSceneOrNull(ctx, args.viewId);
    if (!vs) return fail('view not found', 'not-found');

    let viewCenter: Vector | null = null;
    try {
        viewCenter = vs.view.getViewCenter() as Vector;
    } catch {
        return fail('view center unavailable', 'native');
    }
    if (!viewCenter) return fail('view center unavailable', 'native');

    const r = rend as unknown as { center: Vector };
    const distance = safeRead<number>(() => {
        const cur = r.center as unknown as { sub: (v: Vector) => { length: () => number } };
        return cur.sub(viewCenter as Vector).length();
    }, Number.POSITIVE_INFINITY);
    if (distance < 0.1) {
        return ok({ moved: false });
    }

    // Center assignment is a void mutation: a throw rolls back (no commit),
    // so `moved: true` only ever reports a committed center.
    return undoTxnResult(scene as Scene, 'Change map renderer center', () => {
        // Typed setter: pass the wrapper itself (wrapper layer
        // unwraps for the C++ side and fires the PROPCHG that
        // triggers map redraw).
        r.center = viewCenter as Vector;
        return ok({ moved: true });
    });
}
