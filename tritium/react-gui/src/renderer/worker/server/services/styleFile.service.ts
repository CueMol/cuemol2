// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// style file I/O.
// Mirrors UXP `workspace_panel.js` handlers:
//   - loadStyleSetFromFile      -> onStyLoadFile  (always loads as read-only)
//   - saveStyleSetToFile        -> onStySaveFileAs (path-explicit save)
//   - saveStyleSetToCurrentSrc  -> onStySaveFile   (uses current StyleSet.src;
//                                 caller falls back to save-as when there is
//                                 no src by checking `getStyleSet().src`
//                                 from the pre-fetched styleInfo)
//
// The renderer side is responsible for invoking the native file picker
// (via DIALOG_STYLE_OPEN / DIALOG_STYLE_SAVE IPCs) and forwarding the
// resolved absolute path here. The worker does not own the dialog.

import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';
import { isValidUid } from '../../shared/uid';

interface StyleManagerLike {
    loadStyleSetFromFile(scopeId: number, path: string, readOnly: boolean): number;
    saveStyleSetToFile(scopeId: number, styleSetId: number, path: string): boolean;
    getStyleSetSource(styleSetId: number): string;
    firePendingEvents?(): void;
}

function getStyleMgr(ctx: WorkerContext): StyleManagerLike | null {
    return (ctx.svc.getService('StyleManager') as unknown as StyleManagerLike | null) ?? null;
}

// --- loadStyleSetFromFile ---

export interface LoadStyleSetFromFileArgs {
    sceneId: number;
    /** Absolute path returned by the renderer-side native file picker. */
    path: string;
}

export interface LoadStyleSetFromFileResult {
    ok: boolean;
    /** New StyleSet uid, or -1 on failure (matches the C++ contract). */
    newId: number;
}

function loadStyleSetFromFile(
    ctx: WorkerContext,
    args: LoadStyleSetFromFileArgs,
): LoadStyleSetFromFileResult {
    const empty: LoadStyleSetFromFileResult = { ok: false, newId: -1 };
    if (args.path.length === 0) return empty;
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const mgr = getStyleMgr(ctx);
    if (!mgr) return empty;

    let newId = -1;
    withUndoTxn(scene, 'Load style file', () => {
        // UXP `onStyLoadFile` always passes bReadOnly=true for the
        // file-load entry point -- external styles arrive read-only by
        // default. The user can toggle off later via the ctxmenu item.
        newId = mgr.loadStyleSetFromFile(args.sceneId, args.path, true);
    });
    if (!isValidUid(newId)) return empty;
    try { mgr.firePendingEvents?.(); } catch { /* ignore */ }
    return { ok: true, newId };
}

// --- saveStyleSetToFile (Save As) ---

export interface SaveStyleSetToFileArgs {
    sceneId: number;
    /** scope id (0 for global, scene.uid for scene-local). */
    scopeId: number;
    styleSetId: number;
    /** Absolute path returned by the renderer-side native save dialog. */
    path: string;
}

export interface SaveStyleSetToFileResult {
    ok: boolean;
}

function saveStyleSetToFile(
    ctx: WorkerContext,
    args: SaveStyleSetToFileArgs,
): SaveStyleSetToFileResult {
    if (args.path.length === 0) return { ok: false };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mgr = getStyleMgr(ctx);
    if (!mgr) return { ok: false };

    let ok = false;
    // UXP wraps the Save As call in a "Change style's source" undo txn
    // because `saveStyleSetToFile` updates `StyleSet.src` as a side-effect.
    withUndoTxn(scene, "Change style's source", () => {
        ok = mgr.saveStyleSetToFile(args.scopeId, args.styleSetId, args.path);
    });
    return { ok };
}

// --- saveStyleSetToCurrentSrc (overwrite) ---

export interface SaveStyleSetToCurrentSrcArgs {
    sceneId: number;
    scopeId: number;
    styleSetId: number;
}

export interface SaveStyleSetToCurrentSrcResult {
    ok: boolean;
    /**
     * True when the style had a `src` and we performed the save in place.
     * False when there was no src -- the renderer should fall back to the
     * Save As flow (matches UXP `onStySaveFile`'s "perform save-as" branch).
     */
    saved: boolean;
}

function saveStyleSetToCurrentSrc(
    ctx: WorkerContext,
    args: SaveStyleSetToCurrentSrcArgs,
): SaveStyleSetToCurrentSrcResult {
    const empty: SaveStyleSetToCurrentSrcResult = { ok: false, saved: false };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const mgr = getStyleMgr(ctx);
    if (!mgr) return empty;

    const src = mgr.getStyleSetSource(args.styleSetId);
    if (!src) {
        // No src -- caller should run save-as instead. Reported as ok+saved:false
        // so the renderer can distinguish "service failed" from "empty src".
        return { ok: true, saved: false };
    }

    let ok = false;
    withUndoTxn(scene, 'Save style file', () => {
        ok = mgr.saveStyleSetToFile(args.scopeId, args.styleSetId, src);
    });
    return { ok, saved: ok };
}

export const services = {
    loadStyleSetFromFile,
    saveStyleSetToFile,
    saveStyleSetToCurrentSrc,
};
