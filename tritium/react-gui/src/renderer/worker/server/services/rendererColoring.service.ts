// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase 3c of the panel.workspace migration: renderer Coloring / Paint menu
// support in the ScenePane right-click context menu.
//
// Phase 3c-1: static Coloring submenu items — `Qm2Main.setRendColoring`
//             (style-* and paint-type-* branches)
// Phase 3c-2: dynamic Paint (Secondary str.) sub-submenu —
//             `cuemolui.populateStyleMenus` filtered by /Paint$/
// Phase 3c-3a: Paint color picker — `ws.onPaintMol`

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { ColoringScheme } from '@cuemol/core/src/wrappers/ColoringScheme';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { WorkerContext } from '../types/WorkerContext';
import type { RendColoringId } from '../../../../shared/ipcTypes';
import { withUndoTxn } from './withUndoTxn';
import { remove as styleRemove, push as stylePush } from './helpers/styleutil';
import { makeColor } from './helpers/makeColor';

// ─── getPaintColoringStyles (Phase 3c-2) ──────────────────────────────────
//
// Mirrors UXP `cuemolui.populateStyleMenus` with the `/Paint$/` regex used
// by the renderer Coloring submenu's "Paint (Secondary str.)" sub-submenu.
// We always merge the global style set (sceneId = 0) with the scene-local
// set so user styles in the active scene are included.

export interface GetPaintColoringStylesArgs {
    sceneId: number;
}

export interface PaintColoringStyleEntry {
    /** Raw style name; the action dispatches `style-<name>`. */
    name: string;
    /** Human-friendly label — `desc` when present, otherwise the raw name. */
    label: string;
}

export interface GetPaintColoringStylesResult {
    ok: boolean;
    entries: PaintColoringStyleEntry[];
}

interface RawStyleEntry {
    name?: string;
    desc?: string;
    type?: string;
}

const PAINT_RE = /Paint$/;

function fetchStyleEntries(ctx: WorkerContext, sceneId: number): RawStyleEntry[] {
    try {
        const json = ctx.styleMgr.getStyleNamesJSON(sceneId);
        if (!json) return [];
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed as RawStyleEntry[];
    } catch {
        return [];
    }
}

function getPaintColoringStyles(
    ctx: WorkerContext,
    args: GetPaintColoringStylesArgs,
): GetPaintColoringStylesResult {
    const merged = [
        ...fetchStyleEntries(ctx, 0),
        ...fetchStyleEntries(ctx, args.sceneId),
    ];
    const entries: PaintColoringStyleEntry[] = [];
    for (const raw of merged) {
        const name = typeof raw?.name === 'string' ? raw.name : '';
        if (!name || !PAINT_RE.test(name)) continue;
        const desc = typeof raw?.desc === 'string' ? raw.desc : '';
        entries.push({ name, label: desc || name });
    }
    return { ok: true, entries };
}

export interface SetRendererColoringArgs {
    sceneId: number;
    rendId: number;
    coloringId: RendColoringId;
}

export interface SetRendererColoringResult {
    ok: boolean;
}

function isMolSurf(rend: Renderer): boolean {
    try {
        return (rend as unknown as { type_name: string }).type_name === 'molsurf';
    } catch {
        return false;
    }
}

/**
 * Apply a `style-XXX` coloring style.
 *
 * Steps mirror UXP:
 *   1. strip existing `*Paint$` entries from rend.style,
 *   2. push the new style name,
 *   3. on molsurf, force colormode = "molecule" (the surface ignores
 *      coloring when colormode != "molecule"),
 *   4. resetProp("coloring") so the new style's coloring takes effect,
 *   5. applyStyles(newStyle).
 */
function applyStyleColoring(rend: Renderer, styleName: string): void {
    const curStyle = rend.style ?? '';
    const stripped = styleRemove(curStyle, /Paint$/);
    const newStyle = stylePush(stripped, styleName);

    if (isMolSurf(rend)) {
        (rend as unknown as { colormode: string }).colormode = 'molecule';
    }
    rend.resetProp('coloring');
    rend.applyStyles(newStyle);
}

/**
 * Apply a `paint-type-XXX` coloring by instantiating a fresh coloring object
 * and assigning it. On molsurf, also force colormode = "molecule".
 */
function applyObjColoring(
    ctx: WorkerContext,
    rend: Renderer,
    coloringClassName: string,
): void {
    const coloring = ctx.svc.createObj(coloringClassName) as ColoringScheme;
    if (isMolSurf(rend)) {
        (rend as unknown as { colormode: string }).colormode = 'molecule';
    }
    (rend as unknown as MolRenderer).coloring = coloring;
}

function setRendererColoring(
    ctx: WorkerContext,
    args: SetRendererColoringArgs,
): SetRendererColoringResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };

    // style-* IDs share one handler (Phase 3c-1 static + Phase 3c-2 dynamic
    // Paint(SS) entries flow through the same applyStyles path).
    if (args.coloringId.startsWith('style-')) {
        const styleName = args.coloringId.substring('style-'.length);
        if (!styleName) return { ok: false };
        withUndoTxn(scene, 'Change coloring style', () => {
            applyStyleColoring(rend, styleName);
        });
        return { ok: true };
    }

    switch (args.coloringId) {
        case 'paint-type-bfac':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'BfacColoring');
            });
            return { ok: true };
        case 'paint-type-rainbow':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'RainbowColoring');
            });
            return { ok: true };
        default:
            // Defensive — typed contract prevents reaching here at compile
            // time, but template-literal widening (`style-${string}`) leaks
            // through the narrowed default branch.
            return { ok: false };
    }
}

// ─── paintRendererSelection (Phase 3c-3a) ─────────────────────────────────
//
// Insert a paint entry (color + selection) into the renderer's coloring.
// Mirrors UXP `ws.onPaintMol` (`workspace_panel_ctxtmenu.js`). The selection
// is read from the renderer's parent MolCoord — the renderer's own `sel`
// restricts display but the Paint menu always uses the mol's active sel
// (matching UXP behaviour).
//
// Prerequisites verified per-call:
//   - renderer's coloring class is `PaintColoring`
//   - parent mol has a non-empty `sel`
// Both gated client-side via `getRendererPaintInfo` (the Paint submenu is
// hidden when canPaint is false) but re-checked here for correctness.

export interface PaintRendererSelectionArgs {
    sceneId: number;
    rendId: number;
    /** CueMol color value string, e.g. "#FFF", "hsb(0, 1.0, 1.0)". */
    colorValue: string;
}

export interface PaintRendererSelectionResult {
    ok: boolean;
}

function getMolFromRenderer(rend: Renderer): MolCoord | null {
    try {
        const client = rend.getClientObj();
        return (client as unknown as MolCoord | null) ?? null;
    } catch {
        return null;
    }
}

function getMolSel(mol: MolCoord): MolSelection | null {
    try {
        return mol.sel ?? null;
    } catch {
        return null;
    }
}

function isSelEmpty(sel: MolSelection): boolean {
    try {
        // `MolSelection.isEmpty()` matches UXP's `sel.isEmpty()` gate.
        const isEmpty = (sel as unknown as { isEmpty?: () => boolean }).isEmpty;
        return typeof isEmpty === 'function' ? isEmpty.call(sel) : false;
    } catch {
        return false;
    }
}

function getColoringClassName(rend: Renderer): string {
    try {
        const c = (rend as unknown as MolRenderer).coloring;
        if (!c) return '';
        return c.getClassName();
    } catch {
        return '';
    }
}

function paintRendererSelection(
    ctx: WorkerContext,
    args: PaintRendererSelectionArgs,
): PaintRendererSelectionResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
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

// ─── getRendererPaintInfo (Phase 3c-3a gate) ──────────────────────────────
//
// Tells the renderer side whether the Paint submenu should be shown for
// a given renderer right now. Mirrors UXP's `checkPaintColoring()` gate.

export interface GetRendererPaintInfoArgs {
    sceneId: number;
    rendId: number;
}

export interface GetRendererPaintInfoResult {
    /** True iff coloring is PaintColoring AND the parent mol has a non-empty sel. */
    canPaint: boolean;
}

function getRendererPaintInfo(
    ctx: WorkerContext,
    args: GetRendererPaintInfoArgs,
): GetRendererPaintInfoResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { canPaint: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { canPaint: false };
    if (getColoringClassName(rend) !== 'PaintColoring') return { canPaint: false };
    const mol = getMolFromRenderer(rend);
    if (!mol) return { canPaint: false };
    const sel = getMolSel(mol);
    if (!sel || isSelEmpty(sel)) return { canPaint: false };
    return { canPaint: true };
}

// ─── paintObjectSelection (Phase 5d) ──────────────────────────────────────
//
// Object-level paint: insert a paint entry into the MolCoord's own
// coloring scheme. Mirrors UXP `ws.onPaintMol` object branch — the same
// handler that backs the renderer Paint menu also serves the object
// Paint menu, branching on whether the selected node has `getClientObj`
// (renderer) or `sel` directly (object).
//
// Gated client-side by `getObjectPaintInfo` so the Paint submenu is
// hidden when the object's coloring is not PaintColoring or its sel is
// empty.

export interface PaintObjectSelectionArgs {
    sceneId: number;
    objId: number;
    /** CueMol color value string, e.g. "#FFF", "hsb(0, 1.0, 1.0)". */
    colorValue: string;
}

export interface PaintObjectSelectionResult {
    ok: boolean;
}

function getObjectColoringClassName(mol: MolCoord): string {
    try {
        const c = (mol as unknown as { coloring: ColoringScheme | null }).coloring;
        if (!c) return '';
        return c.getClassName();
    } catch {
        return '';
    }
}

function paintObjectSelection(
    ctx: WorkerContext,
    args: PaintObjectSelectionArgs,
): PaintObjectSelectionResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
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

// ─── getObjectPaintInfo (Phase 5d gate) ───────────────────────────────────
//
// UXP `wspcPnlObjPaintMenu` is shown unconditionally — the only gate is
// `onPaintMol`'s "selection is empty" early-return + a try/catch that
// silently rolls back the txn when `insertBefore` is missing (e.g. when
// the current coloring is the default SolidColoring rather than
// PaintColoring). We mirror that here by gating only on a non-empty sel
// so the menu surfaces as soon as the user has something selected. The
// worker `paintObjectSelection` still refuses safely when coloring is
// not PaintColoring, so a stray click is a no-op rather than a crash.

export interface GetObjectPaintInfoArgs {
    sceneId: number;
    objId: number;
}

export interface GetObjectPaintInfoResult {
    /** True iff sel is non-empty. Coloring class is not gated here. */
    canPaint: boolean;
}

function getObjectPaintInfo(
    ctx: WorkerContext,
    args: GetObjectPaintInfoArgs,
): GetObjectPaintInfoResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { canPaint: false };
    const mol = scene.getObject(args.objId) as MolCoord | null;
    if (!mol) return { canPaint: false };
    const sel = getMolSel(mol);
    if (!sel || isSelEmpty(sel)) return { canPaint: false };
    return { canPaint: true };
}

export const services = {
    setRendererColoring,
    getPaintColoringStyles,
    paintRendererSelection,
    getRendererPaintInfo,
    paintObjectSelection,
    getObjectPaintInfo,
};
