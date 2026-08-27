/**
 * @file worker/server/services/coloring/paintClipboard.ts
 * @description Paint-deck Copy / Cut / Paste row transfer and the
 * Delete-all list mutation. Mirrors UXP `coloring-panel.js`
 * `onCopy` / `onCut` / `onPaste` / `onDeleteCmd` (delete-all branch).
 *
 * These services are **stateless**: Copy and Cut return the rows they read
 * and Paste takes rows as an argument. The clipboard itself is the OS
 * clipboard, owned by the main process (`main/cuemolClipboard.ts`), so a
 * paint selection can be exchanged with the UXP CueMol2 app and between
 * CueMol3 instances.
 *
 * Rows travel as the C++ string forms and are recompiled against the
 * destination scene on paste, which is what makes a cross-scene (and
 * cross-process) paste meaningful at all.
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
    PaintMutationResult,
} from './types';

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
 * Shared prologue for Copy and Cut: resolve the target and read the
 * requested rows. Returns the resolved target, the rows, and the indices
 * actually taken; null when nothing could be read.
 */
function takeRows(
    ctx: WorkerContext,
    args: CopyPaintEntriesArgs,
): { target: PaintTarget; idxs: number[]; entries: PaintClipboardEntry[] } | null {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return null;
    const idxs = normalizeIdxs(args.idxs, target.coloring.size);
    if (idxs.length === 0) return null;
    const entries = readEntries(target.coloring, idxs);
    if (entries.length === 0) return null;
    return { target, idxs, entries };
}

/** Read the selected paint rows for the caller to copy (UXP `onCopy`). */
export function copyPaintEntries(
    ctx: WorkerContext,
    args: CopyPaintEntriesArgs,
): CopyPaintEntriesResult {
    const taken = takeRows(ctx, args);
    if (!taken) return { ok: false, entries: [] };
    return { ok: true, entries: taken.entries };
}

/**
 * Cut the selected paint rows: read them, then delete under one undo
 * transaction.
 *
 * UXP `onCut` chains `onCopy` + `onDeleteCmd`, and only the delete half
 * opens a transaction -- the copy touches no scene state. One txn is
 * therefore both the UXP behaviour and the one a user expects: a single
 * Undo puts the cut rows back. The caller writes the returned rows to the
 * clipboard afterwards; if that write fails the rows are already gone, but
 * that single Undo restores them.
 */
export function cutPaintEntries(
    ctx: WorkerContext,
    args: CopyPaintEntriesArgs,
): CopyPaintEntriesResult {
    const taken = takeRows(ctx, args);
    if (!taken) return { ok: false, entries: [] };
    const { target, idxs, entries } = taken;

    withUndoTxn(target.scene, 'Cut paint entry', () => {
        materializeColoringIfDefault(target.rend);
        const live = liveColoring(target.rend);
        // Descending, so each removal leaves the lower indices valid
        // (UXP `_deletePaintEntriesImpl` sorts the same way).
        for (let i = idxs.length - 1; i >= 0; --i) {
            live.removeAt(idxs[i]);
        }
    });
    return { ok: true, entries };
}

/**
 * Insert clipboard rows into the target's PaintColoring (UXP `onPaste` /
 * `_pasteImpl`).
 *
 * With a row selected the block is inserted before it; with no selection
 * it is appended. Entries whose selection or colour does not compile
 * against the destination scene are skipped rather than failing the whole
 * paste, matching UXP's per-entry try/catch -- which is what lets a
 * payload written by another scene, or another app, paste as far as it can.
 */
export function pastePaintEntries(
    ctx: WorkerContext,
    args: PastePaintEntriesArgs,
): PastePaintEntriesResult {
    const empty: PastePaintEntriesResult = { ok: false, count: 0, startIdx: -1 };
    if (!Array.isArray(args.entries) || args.entries.length === 0) return empty;
    const target = resolvePaintTarget(ctx, args);
    if (!target) return empty;
    const { scene, rend, coloring } = target;

    const adds: { sel: SelCommand; col: AbstractColor }[] = [];
    for (const entry of args.entries) {
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
 * Delete the selected paint rows under one undo transaction (UXP
 * `onDeleteCmd` -> `_deletePaintEntriesImpl`).
 *
 * Rows are removed in descending index order so each removal leaves the
 * lower indices valid -- the same reason `cutPaintEntries` does it, and
 * the same order UXP sorts into. Deleting one row is just the one-element
 * case, so this is the only delete path the deck needs.
 */
export function removePaintEntries(
    ctx: WorkerContext,
    args: CopyPaintEntriesArgs,
): PaintMutationResult {
    const target = resolvePaintTarget(ctx, args);
    if (!target) return { ok: false };
    const idxs = normalizeIdxs(args.idxs, target.coloring.size);
    if (idxs.length === 0) return { ok: false };

    withUndoTxn(target.scene, 'Delete paint entry', () => {
        materializeColoringIfDefault(target.rend);
        const live = liveColoring(target.rend);
        for (let i = idxs.length - 1; i >= 0; --i) {
            live.removeAt(idxs[i]);
        }
    });
    return { ok: true };
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
