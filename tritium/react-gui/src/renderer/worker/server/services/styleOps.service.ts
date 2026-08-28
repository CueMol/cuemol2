// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// style ctxmenu CRUD + read-only toggle. Mirrors the UXP
// handlers in `workspace_panel.js`:
//   - createStyleSet      -> `createStyle` (NB UXP uses a window.prompt
//                            here; the renderer handles the name input
//                            via TextPromptDialog before dispatch)
//   - destroyStyleSet     -> `destroyStyle`
//   - toggleStyleSetReadOnly -> `onStyToggleRo`
//
// Style nodes have no name setter and global styles (`scopeId === 0`) are
// not editable, matching UXP `onStyToggleRo` early-return.

import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';

interface StyleManagerLike {
    createStyleSet(name: string, scopeId: number): number;
    destroyStyleSet(scopeId: number, styleSetId: number): boolean;
    hasStyleSet(name: string, scopeId: number): number;
    getStyleSet(styleSetId: number): StyleSetLike | null;
    firePendingEvents?(): void;
}

interface StyleSetLike {
    name: string;
    src: string;
    readonly: boolean;
    modified: boolean;
}

function getStyleMgr(ctx: WorkerContext): StyleManagerLike | null {
    const mgr = ctx.svc.getService('StyleManager') as unknown as StyleManagerLike | null;
    return mgr ?? null;
}

// --- createStyleSet ---

export interface CreateStyleSetArgs {
    sceneId: number;
    /** User-confirmed name. Worker rejects empty / already-taken names. */
    name: string;
}

export interface CreateStyleSetResult {
    ok: boolean;
    /** New StyleSet uid, or -1 on failure. */
    newId: number;
}

function createStyleSet(
    ctx: WorkerContext,
    args: CreateStyleSetArgs,
): CreateStyleSetResult {
    const empty: CreateStyleSetResult = { ok: false, newId: -1 };
    const trimmed = args.name.trim();
    if (trimmed.length === 0) return empty;
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const mgr = getStyleMgr(ctx);
    if (!mgr) return empty;
    if (mgr.hasStyleSet(trimmed, args.sceneId) !== 0) return empty;

    let newId = -1;
    withUndoTxn(scene, 'Create style', () => {
        newId = mgr.createStyleSet(trimmed, args.sceneId);
    });
    if (newId < 0) return empty;
    return { ok: true, newId };
}

// --- destroyStyleSet ---

export interface DestroyStyleSetArgs {
    sceneId: number;
    /** scope id of the style set (0 for global, scene.uid for scene-local). */
    scopeId: number;
    styleSetId: number;
}

export interface DestroyStyleSetResult {
    ok: boolean;
}

function destroyStyleSet(
    ctx: WorkerContext,
    args: DestroyStyleSetArgs,
): DestroyStyleSetResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const mgr = getStyleMgr(ctx);
    if (!mgr) return { ok: false };

    let ok = false;
    withUndoTxn(scene, 'Destroy style', () => {
        ok = mgr.destroyStyleSet(args.scopeId, args.styleSetId);
    });
    return { ok };
}

// --- toggleStyleSetReadOnly ---
//
// UXP `onStyToggleRo`: global styles (`scope==0`) are not toggleable, and
// modified scene-local styles cannot move read-only -> read-write fails
// silently (the menu item is disabled in that case via pre-fetch).
// Returns the new readonly state on success.

export interface ToggleStyleSetReadOnlyArgs {
    sceneId: number;
    scopeId: number;
    styleSetId: number;
}

export interface ToggleStyleSetReadOnlyResult {
    ok: boolean;
    /** Resulting readonly state when ok===true. */
    readonly: boolean;
}

function toggleStyleSetReadOnly(
    ctx: WorkerContext,
    args: ToggleStyleSetReadOnlyArgs,
): ToggleStyleSetReadOnlyResult {
    const empty: ToggleStyleSetReadOnlyResult = { ok: false, readonly: false };
    if (args.scopeId === 0) return empty;
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const mgr = getStyleMgr(ctx);
    if (!mgr) return empty;
    const set = mgr.getStyleSet(args.styleSetId);
    if (!set) return empty;

    let next: boolean;
    if (set.readonly) {
        next = false;
    } else {
        // RW -> RO refused when modified (UXP's alert is dropped; the
        // menu item is already disabled by the pre-fetch gate).
        if (set.modified) return empty;
        next = true;
    }

    let assigned = false;
    withUndoTxn(scene, 'Toggle style read-only', () => {
        set.readonly = next;
        assigned = true;
    });
    if (!assigned) return empty;
    return { ok: true, readonly: next };
}

export const services = {
    createStyleSet,
    destroyStyleSet,
    toggleStyleSetReadOnly,
};
