/**
 * @file worker/server/services/helpers/simplifySel.ts
 * @description Equivalent, shorter forms of a selection expression built by
 * wrapping the current one, computed by C++ `SelCommand` (`SelSimplifier`).
 *
 * The GUI's "add to selection", the Selection Builder and the console dialects
 * build an expression by wrapping the current one (`(cur) or (term)`), which
 * grows with every step. These helpers rewrite such an expression into an
 * equivalent one (see docs/architecture/selection-simplify.md). Only built
 * expressions go through here: an expression a user typed is kept as typed.
 * Read-only: nothing is written to the scene.
 */

import type { SelCommand } from '@cuemol/core/src/wrappers/SelCommand';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { makeSel } from './makeSel';

/** Compile `selStr` in `sceneId` and run `fn` on it; null when it does not compile. */
function withSel(
    ctx: WorkerContext,
    selStr: string,
    sceneId: number,
    fn: (sel: SelCommand) => string,
): string | null {
    // Any failure (no SelCommand, a C++ throw) leaves the caller's own form.
    try {
        const sel = makeSel(ctx, selStr, sceneId);
        return sel ? fn(sel) : null;
    } catch {
        return null;
    }
}

/**
 * The simplified form of `selStr`, or `selStr` itself when it is empty, does
 * not compile, or cannot be simplified.
 *
 * @param ctx - Worker context.
 * @param selStr - The built expression.
 * @param sceneId - Scene whose named selections the expression may name.
 * @returns An equivalent expression.
 */
export function simplifySel(ctx: WorkerContext, selStr: string, sceneId: number): string {
    if (!selStr.trim()) return selStr;
    return withSel(ctx, selStr, sceneId, (sel) => sel.simplify()) || selStr;
}

/** The context menu's Invert: `not (prev)`, simplified; `*` for no selection. */
export function invertSel(ctx: WorkerContext, prev: string, sceneId: number): string {
    if (!prev.trim()) return '*';
    return withSel(ctx, prev, sceneId, (sel) => sel.invertSimplified()) ?? `not (${prev})`;
}

/** The context menu's Toggle sidechain: `bysidech (prev)`, or the inside of one. */
export function toggleSidechainSel(ctx: WorkerContext, prev: string, sceneId: number): string {
    return withSel(ctx, prev, sceneId, (sel) => sel.toggleSidechain()) ?? `bysidech (${prev})`;
}

/**
 * The context menu's Around: `prev around dist` (in `byres` when asked),
 * replacing an around already at the root.
 */
export function aroundSel(
    ctx: WorkerContext,
    prev: string,
    sceneId: number,
    dist: number,
    byres: boolean,
): string {
    const fallback = byres ? `byres ((${prev}) around ${dist})` : `(${prev}) around ${dist}`;
    return withSel(ctx, prev, sceneId, (sel) => sel.rewriteAround(dist, byres)) ?? fallback;
}
