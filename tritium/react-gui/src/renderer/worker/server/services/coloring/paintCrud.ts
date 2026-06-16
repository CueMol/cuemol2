/**
 * @file worker/server/services/coloring/paintCrud.ts
 * @description Paint-deck CRUD services: insert a paint entry from a current
 * selection (renderer / object), and add / remove / update / move entries in
 * a renderer's PaintColoring list.
 *
 * The four list mutations share `resolvePaintTarget` (scene + target +
 * live PaintColoring resolution) but each opens its own undo transaction
 * and calls `materializeColoringIfDefault` INSIDE that transaction.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { WorkerContext } from '../../types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '../helpers/sceneResolver';
import { makeColor } from '../helpers/makeColor';
import { makeSel } from '../helpers/makeSel';
import {
    getMolFromRenderer,
    getMolSel,
    isSelEmpty,
    getColoringClassName,
    getObjectColoringClassName,
    materializeColoringIfDefault,
    resolvePaintTarget,
} from './colorTargets';
import type {
    PaintRendererSelectionArgs,
    PaintRendererSelectionResult,
    PaintObjectSelectionArgs,
    PaintObjectSelectionResult,
    AddPaintEntryArgs,
    RemovePaintEntryArgs,
    UpdatePaintEntryArgs,
    MovePaintEntryArgs,
    PaintMutationResult,
} from './types';

/**
 * Insert a paint entry (color + selection) into a renderer's coloring.
 *
 * The selection is read from the renderer's parent MolCoord (not the
 * renderer's own display `sel`). Refuses unless the coloring is
 * `PaintColoring` and the mol has a non-empty selection; these are also
 * gated client-side by `getRendererPaintInfo` but re-checked here.
 */
export function paintRendererSelection(
    ctx: WorkerContext,
    args: PaintRendererSelectionArgs,
): PaintRendererSelectionResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };
    const mol = getMolFromRenderer(rend);
    if (!mol) return { ok: false };
    const sel = getMolSel(mol);
    if (!sel || isSelEmpty(sel)) return { ok: false };

    if (getColoringClassName(rend) !== 'PaintColoring') return { ok: false };
    const coloring = (rend as unknown as MolRenderer).coloring as PaintColoring;

    const color = makeColor(ctx, args.colorValue, scene.uid);
    withUndoTxn(scene, 'Insert paint entry', () => {
        coloring.insertBefore(0, sel, color);
    });
    return { ok: true };
}

/**
 * Object-level paint: insert a paint entry into a MolCoord's own coloring
 * scheme. The object counterpart of `paintRendererSelection`. Refuses
 * unless the object's coloring is `PaintColoring` and its selection is
 * non-empty.
 */
export function paintObjectSelection(
    ctx: WorkerContext,
    args: PaintObjectSelectionArgs,
): PaintObjectSelectionResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mol = scene.getObject(args.objId) as MolCoord | null;
    if (!mol) return { ok: false };
    const sel = getMolSel(mol);
    if (!sel || isSelEmpty(sel)) return { ok: false };
    if (getObjectColoringClassName(mol) !== 'PaintColoring') return { ok: false };

    const coloring = (mol as unknown as { coloring: PaintColoring }).coloring;
    const color = makeColor(ctx, args.colorValue, scene.uid);
    withUndoTxn(scene, 'Insert paint entry', () => {
        coloring.insertBefore(0, sel, color);
    });
    return { ok: true };
}

/**
 * Add a paint entry. `idx === size` appends; otherwise inserts before idx.
 */
export function addPaintEntry(
    ctx: WorkerContext,
    args: AddPaintEntryArgs,
): PaintMutationResult {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return { ok: false };
    const { scene, rend } = target;

    const sel = makeSel(ctx, args.selStr, scene.uid);
    if (!sel) return { ok: false };
    const color = makeColor(ctx, args.colorValue, scene.uid);

    withUndoTxn(scene, 'Add paint entry', () => {
        materializeColoringIfDefault(rend);
        const live = (rend as unknown as MolRenderer).coloring as PaintColoring;
        if (args.idx >= live.size) {
            live.append(sel, color);
        } else {
            live.insertBefore(args.idx, sel, color);
        }
    });
    return { ok: true };
}

export function removePaintEntry(
    ctx: WorkerContext,
    args: RemovePaintEntryArgs,
): PaintMutationResult {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return { ok: false };
    const { scene, rend } = target;

    withUndoTxn(scene, 'Delete paint entry', () => {
        materializeColoringIfDefault(rend);
        const live = (rend as unknown as MolRenderer).coloring as PaintColoring;
        live.removeAt(args.idx);
    });
    return { ok: true };
}

export function updatePaintEntry(
    ctx: WorkerContext,
    args: UpdatePaintEntryArgs,
): PaintMutationResult {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return { ok: false };
    const { scene, rend } = target;

    const sel = makeSel(ctx, args.selStr, scene.uid);
    if (!sel) return { ok: false };
    const color = makeColor(ctx, args.colorValue, scene.uid);

    withUndoTxn(scene, 'Change paint entry', () => {
        materializeColoringIfDefault(rend);
        const live = (rend as unknown as MolRenderer).coloring as PaintColoring;
        live.changeAt(args.idx, sel, color);
    });
    return { ok: true };
}

/**
 * Move a paint entry from `fromIdx` to `toIdx`.
 *
 * Mirrors UXP `_moveUpDownImpl`: snapshot (sel, color) -> removeAt -> reinsert.
 */
export function movePaintEntry(
    ctx: WorkerContext,
    args: MovePaintEntryArgs,
): PaintMutationResult {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return { ok: false };
    const { scene, rend, coloring } = target;

    const { fromIdx, toIdx } = args;
    if (fromIdx === toIdx) return { ok: true };
    const size = coloring.size;
    if (fromIdx < 0 || fromIdx >= size) return { ok: false };
    if (toIdx < 0 || toIdx > size - 1) return { ok: false };

    withUndoTxn(scene, 'Move paint entry', () => {
        materializeColoringIfDefault(rend);
        // After materialize, refetch the (possibly new) coloring instance.
        const live = (rend as unknown as MolRenderer).coloring as PaintColoring;
        const sel = live.getSelAt(fromIdx);
        const col = live.getColorAt(fromIdx);
        live.removeAt(fromIdx);
        // toIdx is the target index in the post-remove array; covers both
        // move-up (toIdx < fromIdx) and move-down (toIdx > fromIdx).
        if (toIdx >= live.size) {
            live.append(sel, col);
        } else {
            live.insertBefore(toIdx, sel, col);
        }
    });
    return { ok: true };
}
