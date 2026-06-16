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
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';
import type { ColoringScheme } from '@cuemol/core/src/wrappers/ColoringScheme';
import type { PaintColoring } from '@cuemol/core/src/wrappers/PaintColoring';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '../types/WorkerContext';
import type { RendColoringId } from '../../../../shared/ipcTypes';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';
import { remove as styleRemove, push as stylePush } from './helpers/styleutil';
import { makeColor } from './helpers/makeColor';
import { makeSel } from './helpers/makeSel';
import { fetchStyleEntries } from './helpers/styleEntries';

/**
 * Discriminator for the Coloring panel's selector: both top-level objects
 * (`MolCoord`) and renderers (`MolRenderer`, `MolSurfRenderer`) expose the
 * same `coloring` / `defaultcolor` / `resetProp` interface; UXP's
 * `paint_coloring_filter` accepts both. We default `targetKind` to
 * `'renderer'` so existing renderer-ctxmenu callers stay unchanged.
 */
export type ColoringTargetKind = 'object' | 'renderer';

/**
 * Resolve a coloring target (object or renderer) to a single wrapper that
 * exposes the `coloring` / `defaultcolor` / `resetProp` interface.
 */
function resolveColoringTarget(
    scene: Scene,
    kind: ColoringTargetKind | undefined,
    id: number,
): Renderer | null {
    if (kind === 'object') {
        return (scene.getObject(id) as unknown as Renderer | null) ?? null;
    }
    return (scene.getRenderer(id) as Renderer | null) ?? null;
}

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

const PAINT_RE = /Paint$/;

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
    /** Default 'renderer' for back-compat with the renderer ctxmenu callers. */
    targetKind?: ColoringTargetKind;
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
 * Read `type_name` from a renderer; returns "" for wrappers that don't expose
 * the field (e.g. some renderer groups, or non-renderer objects).
 */
function readTypeName(rend: Renderer): string {
    try {
        const t = (rend as unknown as { type_name?: unknown }).type_name;
        return typeof t === 'string' ? t : '';
    } catch {
        return '';
    }
}

/** Surface-class renderers eligible for the Elepot deck. */
function isElepotCapable(rend: Renderer): boolean {
    const t = readTypeName(rend);
    return t === 'molsurf' || t === 'dsurface' || t === 'dsurf2';
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
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };

    // style-* ids share one handler: static and dynamic Paint(SS) entries
    // both flow through the same applyStyles path. Objects have no
    // `applyStyles` so the style path is renderer-only.
    if (args.coloringId.startsWith('style-')) {
        if (args.targetKind === 'object') return { ok: false };
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
        case 'paint-type-paint':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'PaintColoring');
            });
            return { ok: true };
        case 'paint-type-cpk':
            withUndoTxn(scene, 'Change coloring', () => {
                applyObjColoring(ctx, rend, 'CPKColoring');
            });
            return { ok: true };
        case 'paint-type-solid':
        case 'paint-type-resetdef':
            // UXP `setRendColoring`: both Solid and "Reset to default" route
            // through `resetProp("coloring")`. The unknown deck then shows
            // the renderer's defaultcolor picker.
            withUndoTxn(scene, 'Reset coloring', () => {
                rend.resetProp('coloring');
            });
            return { ok: true };
        case 'paint-type-elepot':
            // UXP `setDefaultElepot`: only valid for molsurf / dsurface.
            // Switches `colormode = "potential"` and, when the renderer has
            // no `elepot` yet, picks the first ElePotMap in the scene as a
            // sensible default. Mirrors `setDefaultElepot` in coloring-panel.js.
            if (!isElepotCapable(rend)) return { ok: false };
            withUndoTxn(scene, 'Change to elepot coloring', () => {
                const r = rend as unknown as {
                    colormode: string;
                    elepot: string;
                };
                if (!r.elepot) {
                    const defName = findFirstElePotMapName(ctx, scene);
                    if (defName) r.elepot = defName;
                }
                r.colormode = 'potential';
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

// ────────────────────────────────────────────────────────────
// Coloring panel — renderer listing + state + Paint CRUD + Solid
// ────────────────────────────────────────────────────────────

export interface ListPaintCapableRenderersArgs {
    sceneId: number;
}

/**
 * One row in the Coloring panel's selector. Mirrors UXP
 * `paint_coloring_filter`, which accepts both top-level objects
 * (`elem.cat === 'obj'`) and renderers (`elem.cat === 'rend'`) that expose
 * a `coloring` property. For objects the panel edits `mol.coloring`
 * directly; for renderers it edits `rend.coloring` (or `rend.defaultcolor`
 * for the Solid deck).
 */
export interface PaintCapableRendererEntry {
    /** 'object' for MolCoord rows, 'renderer' for child renderer rows. */
    targetKind: ColoringTargetKind;
    /** C++ uid of the object or renderer this row represents. */
    rendId: number;
    /** Display name of the target. */
    name: string;
    /**
     * For renderer rows this is `type_name` (e.g. "cartoon"); for object
     * rows it is the object's class name (e.g. "MolCoord"). Used purely
     * for the secondary label in the selector.
     */
    typeName: string;
    /** Parent object id; equal to `rendId` for object rows. */
    objId: number;
    /** Parent object name; equal to `name` for object rows. */
    objName: string;
}

export interface ListPaintCapableRenderersResult {
    ok: boolean;
    renderers: PaintCapableRendererEntry[];
}

interface RawSceneObjItem {
    name?: string;
    type?: string;
    ID?: number;
    rends?: RawSceneRendItem[];
}

interface RawSceneRendItem {
    name?: string;
    type?: string;
    ID?: number;
    childNodes?: RawSceneRendItem[];
}

function rendererHasColoringProp(rend: Renderer): boolean {
    // The `paint_coloring_filter` UXP gate checks that the renderer exposes a
    // `coloring` property. Wrapper getters throw for missing properties, so
    // probe via the proxy and discard read-only errors.
    try {
        const c = (rend as unknown as MolRenderer).coloring;
        return c !== undefined;
    } catch {
        return false;
    }
}

function collectRendsRecursive(
    items: RawSceneRendItem[] | undefined,
    out: { id: number; name: string; typeName: string }[],
): void {
    if (!Array.isArray(items)) return;
    for (const it of items) {
        if (typeof it?.ID === 'number') {
            out.push({
                id: it.ID,
                name: it.name ?? '',
                typeName: it.type ?? '',
            });
        }
        if (Array.isArray(it.childNodes)) {
            collectRendsRecursive(it.childNodes, out);
        }
    }
}

function objectHasColoringProp(obj: unknown): boolean {
    try {
        const c = (obj as { coloring?: unknown })?.coloring;
        return c !== undefined;
    } catch {
        return false;
    }
}

/**
 * Build the selector list for the Coloring panel.
 *
 * Mirrors UXP `paint_coloring_filter`, which accepts both top-level
 * objects (`elem.cat === 'obj'`) and renderers (`elem.cat === 'rend'`)
 * with a `coloring` property. The returned list interleaves an object
 * row followed by its paint-capable child renderer rows, so a grouped
 * selector renders the molecule and its sub-renderers together.
 *
 * Renderer groups have no coloring of their own and are skipped (only
 * their leaf renderers contribute rows).
 */
function listPaintCapableRenderers(
    ctx: WorkerContext,
    args: ListPaintCapableRenderersArgs,
): ListPaintCapableRenderersResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, renderers: [] };

    let parsed: unknown;
    try {
        parsed = JSON.parse(scene.getSceneDataJSON());
    } catch {
        return { ok: false, renderers: [] };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        return { ok: false, renderers: [] };
    }

    const out: PaintCapableRendererEntry[] = [];
    // Skip index 0 (the scene element); the rest are objects.
    for (let i = 1; i < parsed.length; i++) {
        const obj = parsed[i] as RawSceneObjItem;
        if (typeof obj?.ID !== 'number') continue;
        const objWrap = scene.getObject(obj.ID);
        if (objWrap && objectHasColoringProp(objWrap)) {
            out.push({
                targetKind: 'object',
                rendId: obj.ID,
                name: obj.name ?? '',
                typeName: obj.type ?? '',
                objId: obj.ID,
                objName: obj.name ?? '',
            });
        }
        const rendList: { id: number; name: string; typeName: string }[] = [];
        collectRendsRecursive(obj.rends, rendList);
        for (const r of rendList) {
            // UXP `paint_coloring_filter` excludes the selection-display
            // renderer (the per-mol "*selection" overlay). It exposes a
            // `coloring` property but is not user-editable.
            if (r.typeName === '*selection') continue;
            const rend = scene.getRenderer(r.id) as Renderer | null;
            if (!rend) continue;
            if (!rendererHasColoringProp(rend)) continue;
            out.push({
                targetKind: 'renderer',
                rendId: r.id,
                name: r.name,
                typeName: r.typeName,
                objId: obj.ID,
                objName: obj.name ?? '',
            });
        }
    }
    return { ok: true, renderers: out };
}

export interface GetRendererColoringStateArgs {
    sceneId: number;
    rendId: number;
    /** Default 'renderer' for back-compat. */
    targetKind?: ColoringTargetKind;
}

export interface PaintEntryDto {
    /** Zero-based index in PaintColoring. */
    idx: number;
    /** Compiled MolSelection re-stringified for display. */
    selStr: string;
    /** Color value formatted by `AbstractColor.toString()`. */
    colorValue: string;
}

/** Per-element colour palette for `CPKColoring`. */
export interface CpkColors {
    colC: string; colN: string; colO: string; colS: string;
    colP: string; colH: string; colX: string;
}

/** Editor params for `RainbowColoring`. */
export interface RainbowParams {
    /** "mol" | "chain" — mirrors UXP `coloring.mode`. */
    mode: string;
    /** "chain" | "resid" | "protss" — UXP `coloring.incr_mode`. */
    incrMode: string;
    /** Hue range start, 0-360 degrees. UXP `coloring.start_hue`. */
    startHue: number;
    /** Hue range end, 0-360 degrees. UXP `coloring.end_hue`. */
    endHue: number;
    /** 0..1; UXP `coloring.sat` (panel widget shows 0..100). */
    saturation: number;
    /** 0..1; UXP `coloring.bri`. */
    brightness: number;
}

/**
 * Editor params for the Elepot deck. Unlike CPK/Rainbow/Bfac these properties
 * live on the **renderer** itself (lowpar/midpar/highpar/lowcol/midcol/highcol/
 * elepot/ramp_above), not on a ColoringScheme; the deck appears when a
 * surface renderer has `colormode === "potential"`.
 */
export interface ElepotParams {
    /** Currently selected ElePotMap object name (empty when none). */
    elepot: string;
    /** UXP `ramp_above` -- "Color by SAS" checkbox. */
    rampAbove: boolean;
    lowColor: string;
    midColor: string;
    highColor: string;
    lowParam: number;
    midParam: number;
    highParam: number;
}

/** Editor params for `BfacColoring`. */
export interface BfacParams {
    /** "bfac" | "occ" | "center"; UXP `coloring.mode`. */
    mode: string;
    /** Low-side colour as a CueMol colour string. */
    lowColor: string;
    /** High-side colour. */
    highColor: string;
    /** "none" | "mol" | "rend"; UXP `coloring.auto`. */
    autoMode: string;
    /** Low parameter value; UXP `coloring.lowpar` (manual mode only). */
    lowParam: number;
    /** High parameter value; UXP `coloring.highpar`. */
    highParam: number;
}

export interface GetRendererColoringStateResult {
    ok: boolean;
    /** Coloring class name (e.g. "PaintColoring"), or "" when coloring is null. */
    className: string;
    /** Stringified renderer.defaultcolor (falls back to "" if unreadable). */
    defaultColor: string;
    /** Populated only when className === "PaintColoring". */
    paintEntries: PaintEntryDto[];
    /** Populated only when className === "CPKColoring". */
    cpkColors?: CpkColors;
    /** Populated only when className === "RainbowColoring". */
    rainbowParams?: RainbowParams;
    /** Populated only when className === "BfacColoring". */
    bfacParams?: BfacParams;
    /**
     * Renderer type name (e.g. "molsurf", "dsurface", "cartoon"). Empty for
     * objects and groups. Used by the renderer-side dropdown to gate the
     * "Electrostatic potential" item.
     */
    surfaceType: string;
    /**
     * MolSurfRenderer colormode (e.g. "molecule", "potential", "solid").
     * Empty for renderers without the colormode property.
     */
    colormode: string;
    /** Populated only when the renderer is a surface AND colormode === "potential". */
    elepotParams?: ElepotParams;
}

function readDefaultColor(rend: Renderer): string {
    try {
        const c = (rend as unknown as { defaultcolor: AbstractColor })
            .defaultcolor;
        return c ? c.toString() : '';
    } catch {
        return '';
    }
}

function readPaintEntries(coloring: PaintColoring): PaintEntryDto[] {
    const out: PaintEntryDto[] = [];
    let size = 0;
    try {
        size = coloring.size;
    } catch {
        return out;
    }
    for (let i = 0; i < size; i++) {
        let selStr = '';
        let colorValue = '';
        try {
            const sel = coloring.getSelAt(i);
            selStr = sel ? sel.toString() : '';
        } catch {
            selStr = '';
        }
        try {
            const col = coloring.getColorAt(i);
            colorValue = col ? col.toString() : '';
        } catch {
            colorValue = '';
        }
        out.push({ idx: i, selStr, colorValue });
    }
    return out;
}

/** Safe property read with stringified fallback. Used for colour props. */
function safeReadColorString(obj: unknown, prop: string): string {
    try {
        const v = (obj as Record<string, AbstractColor | undefined>)[prop];
        return v ? v.toString() : '';
    } catch {
        return '';
    }
}

function safeReadString(obj: unknown, prop: string): string {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return typeof v === 'string' ? v : '';
    } catch {
        return '';
    }
}

function safeReadNumber(obj: unknown, prop: string): number {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return typeof v === 'number' ? v : 0;
    } catch {
        return 0;
    }
}

function readCpkColors(coloring: unknown): CpkColors {
    return {
        colC: safeReadColorString(coloring, 'col_C'),
        colN: safeReadColorString(coloring, 'col_N'),
        colO: safeReadColorString(coloring, 'col_O'),
        colS: safeReadColorString(coloring, 'col_S'),
        colP: safeReadColorString(coloring, 'col_P'),
        colH: safeReadColorString(coloring, 'col_H'),
        colX: safeReadColorString(coloring, 'col_X'),
    };
}

function readRainbowParams(coloring: unknown): RainbowParams {
    return {
        mode: safeReadString(coloring, 'mode'),
        incrMode: safeReadString(coloring, 'incr_mode'),
        startHue: safeReadNumber(coloring, 'start_hue'),
        endHue: safeReadNumber(coloring, 'end_hue'),
        saturation: safeReadNumber(coloring, 'sat'),
        brightness: safeReadNumber(coloring, 'bri'),
    };
}

function readBfacParams(coloring: unknown): BfacParams {
    return {
        mode: safeReadString(coloring, 'mode'),
        lowColor: safeReadColorString(coloring, 'lowcol'),
        highColor: safeReadColorString(coloring, 'highcol'),
        autoMode: safeReadString(coloring, 'auto'),
        lowParam: safeReadNumber(coloring, 'lowpar'),
        highParam: safeReadNumber(coloring, 'highpar'),
    };
}

function safeReadBool(obj: unknown, prop: string): boolean {
    try {
        const v = (obj as Record<string, unknown>)[prop];
        return v === true;
    } catch {
        return false;
    }
}

/**
 * Read the eight Elepot widget values directly off the surface renderer.
 * Mirrors `updateElepotWidgets` in UXP coloring-panel.js. All reads are
 * defensive because dsurface lacks some of the props that molsurf carries.
 */
function readElepotParams(rend: Renderer): ElepotParams {
    return {
        elepot: safeReadString(rend, 'elepot'),
        rampAbove: safeReadBool(rend, 'ramp_above'),
        lowColor: safeReadColorString(rend, 'lowcol'),
        midColor: safeReadColorString(rend, 'midcol'),
        highColor: safeReadColorString(rend, 'highcol'),
        lowParam: safeReadNumber(rend, 'lowpar'),
        midParam: safeReadNumber(rend, 'midpar'),
        highParam: safeReadNumber(rend, 'highpar'),
    };
}

/**
 * Walk the scene's top-level objects and return the first ElePotMap's name.
 * Returns "" when the scene has no ElePotMap; mirrors the `mPotSel.getItemCount() > 0`
 * + `getSelectedObj()` fallback in UXP `setDefaultElepot`.
 */
function findFirstElePotMapName(ctx: WorkerContext, scene: Scene): string {
    try {
        const json = scene.getSceneDataJSON();
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) return '';
        for (let i = 1; i < parsed.length; i++) {
            const obj = parsed[i] as { type?: string; name?: string };
            if (obj?.type === 'ElePotMap' && typeof obj.name === 'string') {
                return obj.name;
            }
        }
    } catch {
        // Fall through to empty.
    }
    // `ctx` reserved for future scene-tree helpers; mark as used.
    void ctx;
    return '';
}

/**
 * Snapshot of the renderer's current coloring for the Coloring panel.
 *
 * The panel uses `className` to decide which deck page to show (PaintColoring
 * → Paint deck; "" or unknown class → Solid/Unknown deck). For the Paint
 * deck the entries are returned eagerly so the panel can render the table
 * without round-tripping.
 */
function getRendererColoringState(
    ctx: WorkerContext,
    args: GetRendererColoringStateArgs,
): GetRendererColoringStateResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) {
        return {
            ok: false, className: '', defaultColor: '',
            paintEntries: [], surfaceType: '', colormode: '',
        };
    }
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) {
        return {
            ok: false, className: '', defaultColor: '',
            paintEntries: [], surfaceType: '', colormode: '',
        };
    }

    const className = getColoringClassName(rend);
    const defaultColor = readDefaultColor(rend);
    // Surface info (only meaningful for renderers; objects have no type_name
    // / colormode and yield empty strings).
    const surfaceType =
        args.targetKind === 'object' ? '' : readTypeName(rend);
    const colormode = isElepotCapable(rend)
        ? safeReadString(rend, 'colormode')
        : '';

    const result: GetRendererColoringStateResult = {
        ok: true,
        className,
        defaultColor,
        paintEntries: [],
        surfaceType,
        colormode,
    };

    // Elepot deck takes priority over the coloring class on surface renderers
    // (mirrors UXP `_setupData` which checks colormode === "potential" before
    // dispatching by coloring class).
    if (isElepotCapable(rend) && colormode === 'potential') {
        result.elepotParams = readElepotParams(rend);
        return result;
    }

    if (className === 'PaintColoring') {
        const coloring = (rend as unknown as MolRenderer).coloring as PaintColoring;
        result.paintEntries = readPaintEntries(coloring);
    } else if (className === 'CPKColoring') {
        const coloring = (rend as unknown as MolRenderer).coloring;
        result.cpkColors = readCpkColors(coloring);
    } else if (className === 'RainbowColoring') {
        const coloring = (rend as unknown as MolRenderer).coloring;
        result.rainbowParams = readRainbowParams(coloring);
    } else if (className === 'BfacColoring') {
        const coloring = (rend as unknown as MolRenderer).coloring;
        result.bfacParams = readBfacParams(coloring);
    }

    return result;
}

export interface AddPaintEntryArgs {
    sceneId: number;
    rendId: number;
    /** Default 'renderer'. */
    targetKind?: ColoringTargetKind;
    /** Insert position; pass `size` to append. */
    idx: number;
    selStr: string;
    colorValue: string;
}

export interface PaintMutationResult {
    ok: boolean;
}

function getPaintColoring(rend: Renderer): PaintColoring | null {
    if (getColoringClassName(rend) !== 'PaintColoring') return null;
    try {
        return (rend as unknown as MolRenderer).coloring as PaintColoring;
    } catch {
        return null;
    }
}

/**
 * Mirror UXP `if (rend._wrapped.isPropDefault("coloring")) rend.coloring = coloring`.
 *
 * When the renderer's `coloring` property is still at its style-inherited
 * default value, the wrapper returns a shared `ColoringScheme` instance.
 * Mutating that shared object would either leak into other renderers or
 * be silently discarded on the next reload. Re-assigning the same value
 * back through the setter materializes a per-renderer non-default copy
 * so subsequent mutations stick. Must be called inside the same undo
 * transaction as the mutation.
 */
function materializeColoringIfDefault(rend: Renderer): void {
    try {
        if (rend.hasPropDefault('coloring')) {
            const coloring = (rend as unknown as MolRenderer).coloring;
            (rend as unknown as MolRenderer).coloring = coloring;
        }
    } catch {
        // hasPropDefault throws for renderers without the property; if it
        // throws we wouldn't have reached here (getPaintColoring would
        // have failed earlier), so swallow defensively and proceed.
    }
}

/**
 * Add a paint entry. `idx === size` appends; otherwise inserts before idx.
 */
function addPaintEntry(
    ctx: WorkerContext,
    args: AddPaintEntryArgs,
): PaintMutationResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    const coloring = getPaintColoring(rend);
    if (!coloring) return { ok: false };

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

export interface RemovePaintEntryArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    idx: number;
}

function removePaintEntry(
    ctx: WorkerContext,
    args: RemovePaintEntryArgs,
): PaintMutationResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    const coloring = getPaintColoring(rend);
    if (!coloring) return { ok: false };

    withUndoTxn(scene, 'Delete paint entry', () => {
        materializeColoringIfDefault(rend);
        const live = (rend as unknown as MolRenderer).coloring as PaintColoring;
        live.removeAt(args.idx);
    });
    return { ok: true };
}

export interface UpdatePaintEntryArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    idx: number;
    selStr: string;
    colorValue: string;
}

function updatePaintEntry(
    ctx: WorkerContext,
    args: UpdatePaintEntryArgs,
): PaintMutationResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    const coloring = getPaintColoring(rend);
    if (!coloring) return { ok: false };

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

export interface MovePaintEntryArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    fromIdx: number;
    toIdx: number;
}

/**
 * Move a paint entry from `fromIdx` to `toIdx`.
 *
 * Mirrors UXP `_moveUpDownImpl`: snapshot (sel, color) → removeAt → reinsert.
 */
function movePaintEntry(
    ctx: WorkerContext,
    args: MovePaintEntryArgs,
): PaintMutationResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    const coloring = getPaintColoring(rend);
    if (!coloring) return { ok: false };

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

export interface SetRendererDefaultColorArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    colorValue: string;
}

export interface SetRendererDefaultColorResult {
    ok: boolean;
}

/**
 * Solid-deck color picker: write the renderer's `defaultcolor` property.
 */
function setRendererDefaultColor(
    ctx: WorkerContext,
    args: SetRendererDefaultColorArgs,
): SetRendererDefaultColorResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };

    const color = makeColor(ctx, args.colorValue, scene.uid);
    withUndoTxn(scene, 'Change default color', () => {
        (rend as unknown as { defaultcolor: AbstractColor }).defaultcolor = color;
    });
    return { ok: true };
}

// ────────────────────────────────────────────────────────────
// Generic coloring-scheme property writer (CPK / Rainbow / Bfac decks)
// ────────────────────────────────────────────────────────────

/**
 * Property names whose value is a CueMol colour string and must be
 * compiled through `makeColor` before being assigned. Keep this set
 * tight: every entry was confirmed against the UXP `coloring-panel.js`
 * commit sites (`onCPKColChanged`, `onBfacChange` `lowcol`/`highcol`).
 */
const COLOR_VALUED_PROPS = new Set<string>([
    'col_C', 'col_N', 'col_O', 'col_S', 'col_P', 'col_H', 'col_X',
    'lowcol', 'highcol',
]);

export interface SetColoringPropArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    /** Property name on the ColoringScheme (e.g. "col_C", "mode", "bri"). */
    propName: string;
    /**
     * Value to write. Strings whose `propName` is in the colour whitelist
     * are compiled via `makeColor` first; otherwise the value is passed
     * through (mode/incr_mode/auto are string enums, hue / params are
     * numbers).
     */
    propValue: string | number;
}

export interface SetColoringPropResult {
    ok: boolean;
}

/**
 * Mirror UXP `commitPropChange`: open an undo txn, materialize the
 * renderer's coloring if still style-default, then assign one property
 * on the active ColoringScheme.
 *
 * Used by the CPK / Rainbow / Bfac decks. Paint deck CRUD has dedicated
 * services (`addPaintEntry`, ...) because it mutates list items rather
 * than scalar properties.
 */
function setColoringProp(
    ctx: WorkerContext,
    args: SetColoringPropArgs,
): SetColoringPropResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    if (getColoringClassName(rend) === '') return { ok: false };

    // For colour-valued props, compile the string into an AbstractColor
    // wrapper and pass the raw `.wrapped` native object -- this mirrors
    // UXP `commitPropChange` which passes `color._wrapped` directly.
    // For non-colour props (mode/incr_mode/auto strings, sliders/params
    // numbers), forward the value as-is.
    let value: unknown = args.propValue;
    if (COLOR_VALUED_PROPS.has(args.propName) && typeof args.propValue === 'string') {
        const ac = makeColor(ctx, args.propValue, scene.uid);
        value = ac.wrapped;
    }

    withUndoTxn(scene, 'Change coloring property', () => {
        materializeColoringIfDefault(rend);
        const live = (rend as unknown as MolRenderer).coloring;
        if (!live) return;
        live.setProp(args.propName, value);
    });
    return { ok: true };
}

// --- Elepot deck (renderer-property writer + ElePotMap selector list) ---

export interface ListElePotMapObjectsArgs {
    sceneId: number;
}

export interface ElePotMapObjectEntry {
    /** C++ uid of the ElePotMap object. */
    objId: number;
    /** Object name shown in the selector. */
    name: string;
}

export interface ListElePotMapObjectsResult {
    ok: boolean;
    objects: ElePotMapObjectEntry[];
}

/**
 * List all ElePotMap objects in the scene. Drives the Elepot deck's
 * "potential object" dropdown. Mirrors UXP `paint-elepot-obj-selector`
 * which filters on `elem.type === "ElePotMap"`.
 */
function listElePotMapObjects(
    ctx: WorkerContext,
    args: ListElePotMapObjectsArgs,
): ListElePotMapObjectsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, objects: [] };
    let parsed: unknown;
    try {
        parsed = JSON.parse(scene.getSceneDataJSON());
    } catch {
        return { ok: false, objects: [] };
    }
    if (!Array.isArray(parsed)) return { ok: false, objects: [] };
    const out: ElePotMapObjectEntry[] = [];
    for (let i = 1; i < parsed.length; i++) {
        const obj = parsed[i] as { ID?: number; type?: string; name?: string };
        if (obj?.type !== 'ElePotMap') continue;
        if (typeof obj.ID !== 'number') continue;
        out.push({ objId: obj.ID, name: obj.name ?? '' });
    }
    return { ok: true, objects: out };
}

/**
 * Elepot props whose value is a CueMol colour string and must be compiled
 * through `makeColor` before being assigned. Reflects UXP `onElepotChange`
 * commit branches.
 */
const ELEPOT_COLOR_PROPS = new Set<string>(['lowcol', 'midcol', 'highcol']);

export interface SetRendererElepotPropArgs {
    sceneId: number;
    rendId: number;
    targetKind?: ColoringTargetKind;
    /**
     * Property name on the surface renderer
     * (`elepot` | `ramp_above` | `lowcol` | `midcol` | `highcol` |
     *  `lowpar` | `midpar` | `highpar`).
     */
    propName: string;
    /**
     * Value to write. Colour-valued props compile to `AbstractColor.wrapped`;
     * `ramp_above` is a boolean; numeric params come through as numbers;
     * `elepot` is the target ElePotMap object name (string).
     */
    propValue: string | number | boolean;
}

export interface SetRendererElepotPropResult {
    ok: boolean;
}

/**
 * Write one Elepot property on a surface renderer.
 *
 * Mirrors UXP `commitElepotPropChange`: open an undo txn, call
 * `rend._wrapped.setProp(propname, val)`. Refuses on non-surface renderers
 * (matches the UXP `rend_type=="molsurf" || "dsurface"` gate).
 */
function setRendererElepotProp(
    ctx: WorkerContext,
    args: SetRendererElepotPropArgs,
): SetRendererElepotPropResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    if (!isElepotCapable(rend)) return { ok: false };

    let value: unknown = args.propValue;
    if (
        ELEPOT_COLOR_PROPS.has(args.propName) &&
        typeof args.propValue === 'string'
    ) {
        const ac = makeColor(ctx, args.propValue, scene.uid);
        value = ac.wrapped;
    }

    withUndoTxn(scene, 'Change Elepot coloring', () => {
        // Surface props live directly on the renderer's native wrapper;
        // use the wrapper's setProp escape hatch (mirrors UXP
        // `rend._wrapped.setProp(propname, val)`).
        (rend as unknown as { setProp: (n: string, v: unknown) => void })
            .setProp(args.propName, value);
    });
    return { ok: true };
}

export const services = {
    setRendererColoring,
    getPaintColoringStyles,
    paintRendererSelection,
    getRendererPaintInfo,
    paintObjectSelection,
    getObjectPaintInfo,
    listPaintCapableRenderers,
    getRendererColoringState,
    addPaintEntry,
    removePaintEntry,
    updatePaintEntry,
    movePaintEntry,
    setRendererDefaultColor,
    setColoringProp,
    listElePotMapObjects,
    setRendererElepotProp,
};
