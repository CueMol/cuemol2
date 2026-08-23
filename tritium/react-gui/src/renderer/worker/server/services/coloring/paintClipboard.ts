/**
 * @file worker/server/services/coloring/paintClipboard.ts
 * @description Paint-deck clipboard (Copy / Cut / Paste) and the
 * Delete-all list mutation. Mirrors UXP `coloring-panel.js`
 * `onCopy` / `onCut` / `onPaste` / `onDeleteCmd` (delete-all branch).
 *
 * The clipboard is a worker-process-local module singleton, the same shape
 * `sceneClipboard.service.ts` uses for scene nodes: the worker is
 * single-threaded so every service shares it, and nothing has to thread it
 * through WorkerContext. Rows are held as the C++ string forms rather than
 * as live wrappers, so a paste recompiles against the destination scene --
 * UXP got the same property from encoding the clipboard as JSON.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { SelCommand } from '@cuemol/core/src/wrappers/SelCommand';
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { WorkerContext } from '../../types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { makeSel } from '../helpers/makeSel';
import { makeColor } from '../helpers/makeColor';
import type { PaintTarget } from './colorTargets';
import { materializeColoringIfDefault, resolvePaintTarget } from './colorTargets';
import type {
    PaintClipboardEntry,
    CopyPaintEntriesArgs,
    CopyPaintEntriesResult,
    PastePaintEntriesArgs,
    PastePaintEntriesResult,
    ClearPaintEntriesArgs,
    GetPaintClipboardInfoArgs,
    GetPaintClipboardInfoResult,
    PaintMutationResult,
} from './types';

let clipboard: PaintClipboardEntry[] = [];

/** Test helper: reset the singleton between cases. Not in the service map. */
export function _resetPaintClipboardForTest(): void {
    clipboard = [];
}

/** The live PaintColoring of a target, refetched after materialization. */
function liveColoring(rend: Renderer): PaintColoring {
    return (rend as unknown as MolRenderer).coloring as PaintColoring;
}

/** Sorted, de-duplicated, in-range row indices. */
function normalizeIdxs(idxs: number[], size: number): number[] {
    const uniq = new Set(idxs.filter((i) => Number.isInteger(i) && i >= 0 && i < size));
    return [...uniq].sort((a, b) => a - b);
}

/** Read (sel, color) at each index as the string forms UXP stores. */
function readEntries(coloring: PaintColoring, idxs: number[]): PaintClipboardEntry[] {
    const out: PaintClipboardEntry[] = [];
    for (const idx of idxs) {
        const sel = coloring.getSelAt(idx);
        const col = coloring.getColorAt(idx);
        if (!sel || !col) continue;
        out.push({ selStr: sel.toString(), colorValue: col.toString() });
    }
    return out;
}

/**
 * Shared prologue for Copy and Cut: resolve the target and snapshot the
 * requested rows onto the clipboard. Returns the resolved target plus the
 * indices actually taken, or null when nothing could be copied (the
 * clipboard is then left untouched).
 */
function snapshotToClipboard(
    ctx: WorkerContext,
    args: CopyPaintEntriesArgs,
): { target: PaintTarget; idxs: number[] } | null {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return null;
    const idxs = normalizeIdxs(args.idxs, target.coloring.size);
    if (idxs.length === 0) return null;
    const picked = readEntries(target.coloring, idxs);
    if (picked.length === 0) return null;
    clipboard = picked;
    return { target, idxs };
}

/** Copy the selected paint rows to the clipboard (UXP `onCopy`). */
export function copyPaintEntries(
    ctx: WorkerContext,
    args: CopyPaintEntriesArgs,
): CopyPaintEntriesResult {
    const taken = snapshotToClipboard(ctx, args);
    return { ok: taken !== null, count: clipboard.length };
}

/**
 * Cut the selected paint rows: copy, then delete under one undo
 * transaction.
 *
 * UXP `onCut` chains `onCopy` + `onDeleteCmd`, and only the delete half
 * opens a transaction -- the copy touches no scene state. One txn is
 * therefore both the UXP behaviour and the one a user expects: a single
 * Undo puts the cut rows back.
 */
export function cutPaintEntries(
    ctx: WorkerContext,
    args: CopyPaintEntriesArgs,
): CopyPaintEntriesResult {
    const taken = snapshotToClipboard(ctx, args);
    if (!taken) return { ok: false, count: clipboard.length };
    const { target, idxs } = taken;

    withUndoTxn(target.scene, 'Cut paint entry', () => {
        materializeColoringIfDefault(target.rend);
        const live = liveColoring(target.rend);
        // Descending, so each removal leaves the lower indices valid
        // (UXP `_deletePaintEntriesImpl` sorts the same way).
        for (let i = idxs.length - 1; i >= 0; --i) {
            live.removeAt(idxs[i]);
        }
    });
    return { ok: true, count: clipboard.length };
}

/**
 * Paste the clipboard rows into the target's PaintColoring (UXP
 * `onPaste` / `_pasteImpl`).
 *
 * With a row selected the block is inserted before it; with no selection
 * it is appended. Entries whose selection or colour no longer compiles
 * against the destination scene are skipped rather than failing the whole
 * paste, matching UXP's per-entry try/catch.
 */
export function pastePaintEntries(
    ctx: WorkerContext,
    args: PastePaintEntriesArgs,
): PastePaintEntriesResult {
    const empty: PastePaintEntriesResult = { ok: false, count: 0, startIdx: -1 };
    if (clipboard.length === 0) return empty;
    const target = resolvePaintTarget(ctx, args);
    if (!target) return empty;
    const { scene, rend, coloring } = target;

    const adds: { sel: SelCommand; col: AbstractColor }[] = [];
    for (const entry of clipboard) {
        try {
            const sel = makeSel(ctx, entry.selStr, scene.uid);
            if (!sel) continue;
            adds.push({ sel, col: makeColor(ctx, entry.colorValue, scene.uid) });
        } catch {
            // Unresolvable named selection or colour: drop this row only.
        }
    }
    if (adds.length === 0) return empty;

    const size = coloring.size;
    const at = args.idx;
    const append = at === null || at < 0 || at >= size;
    const startIdx = append ? size : at;

    withUndoTxn(scene, 'Paste paint entry', () => {
        materializeColoringIfDefault(rend);
        const live = liveColoring(rend);
        if (append) {
            for (const a of adds) live.append(a.sel, a.col);
        } else {
            // Insert at a fixed index in reverse order, so the pasted
            // block ends up in clipboard order (UXP `_pasteImpl` reverses
            // the array before its insertBefore loop).
            for (let i = adds.length - 1; i >= 0; --i) {
                live.insertBefore(at, adds[i].sel, adds[i].col);
            }
        }
    });
    return { ok: true, count: adds.length, startIdx };
}

/**
 * Remove every paint row (UXP `onDeleteCmd` delete-all branch, which
 * calls `PaintColoring.clear()` instead of removing row by row).
 */
export function clearPaintEntries(
    ctx: WorkerContext,
    args: ClearPaintEntriesArgs,
): PaintMutationResult {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return { ok: false };
    const { scene, rend } = target;

    withUndoTxn(scene, 'Delete all paint entries', () => {
        materializeColoringIfDefault(rend);
        liveColoring(rend).clear();
    });
    return { ok: true };
}

/**
 * Report how many rows the paint clipboard holds, so the panel can gate
 * its Paste affordance (UXP left this as a TODO in `onCtxtMenuShowing`
 * and always offered Paste).
 */
export function getPaintClipboardInfo(
    _ctx: WorkerContext,
    _args: GetPaintClipboardInfoArgs,
): GetPaintClipboardInfoResult {
    return { count: clipboard.length };
}
