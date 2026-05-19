/**
 * @file worker/server/services/rendererColoring.service.ts
 * @description Worker-thread services backing the ScenePane renderer- and
 * object-level Coloring / Paint context-menu actions: static coloring
 * styles, the dynamic "Paint (Secondary str.)" style submenu, and the
 * Paint color picker.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolRenderer } from '@cuemol/core/src/wrappers/MolRenderer';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { ColoringScheme } from '@cuemol/core/src/wrappers/ColoringScheme';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { WorkerContext } from '../types/WorkerContext';
import type { RendColoringId } from '../../../../shared/ipcTypes';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';
import { remove as styleRemove, push as stylePush } from './helpers/styleutil';
import { makeColor } from './helpers/makeColor';

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

/**
 * Collect style names ending in `Paint` for the renderer Coloring submenu's
 * "Paint (Secondary str.)" sub-submenu. Merges the global style set
 * (sceneId 0) with the scene-local set so the active scene's user styles
 * are included.
 */
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

/**
 * Apply a coloring to a renderer from a Coloring-submenu selection.
 *
 * `style-XXX` ids (both static items and dynamic Paint(SS) entries) route
 * through `applyStyleColoring`; `paint-type-XXX` ids instantiate a fresh
 * coloring object. Wrapped in an undo transaction.
 */
function setRendererColoring(
    ctx: WorkerContext,
    args: SetRendererColoringArgs,
): SetRendererColoringResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };

    // style-* ids share one handler: static and dynamic Paint(SS) entries
    // both flow through the same applyStyles path.
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

/**
 * Insert a paint entry (color + selection) into a renderer's coloring.
 *
 * The selection is read from the renderer's parent MolCoord (not the
 * renderer's own display `sel`). Refuses unless the coloring is
 * `PaintColoring` and the mol has a non-empty selection; these are also
 * gated client-side by `getRendererPaintInfo` but re-checked here.
 */
function paintRendererSelection(
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

export interface GetRendererPaintInfoArgs {
    sceneId: number;
    rendId: number;
}

export interface GetRendererPaintInfoResult {
    /** True iff coloring is PaintColoring AND the parent mol has a non-empty sel. */
    canPaint: boolean;
}

/**
 * Gate query: whether the renderer Paint submenu should be shown now -
 * true iff the coloring is `PaintColoring` and the parent mol has a
 * non-empty selection.
 */
function getRendererPaintInfo(
    ctx: WorkerContext,
    args: GetRendererPaintInfoArgs,
): GetRendererPaintInfoResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
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

/**
 * Object-level paint: insert a paint entry into a MolCoord's own coloring
 * scheme. The object counterpart of `paintRendererSelection`. Refuses
 * unless the object's coloring is `PaintColoring` and its selection is
 * non-empty.
 */
function paintObjectSelection(
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

export interface GetObjectPaintInfoArgs {
    sceneId: number;
    objId: number;
}

export interface GetObjectPaintInfoResult {
    /** True iff sel is non-empty. Coloring class is not gated here. */
    canPaint: boolean;
}

/**
 * Gate query for the object Paint submenu: true iff the object has a
 * non-empty selection.
 *
 * @remarks The coloring class is intentionally not gated here - the menu
 * surfaces as soon as something is selected, and `paintObjectSelection`
 * refuses safely when the coloring is not `PaintColoring`, so a stray
 * click is a no-op rather than a crash.
 */
function getObjectPaintInfo(
    ctx: WorkerContext,
    args: GetObjectPaintInfoArgs,
): GetObjectPaintInfoResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
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
