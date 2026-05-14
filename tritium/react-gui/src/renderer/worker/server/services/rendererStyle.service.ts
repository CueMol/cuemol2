// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase 3c-3b of the panel.workspace migration: Style (shape) submenu on
// the ScenePane renderer context menu.
//
// Mirrors UXP `ws.onStyleShowing` (population) and `ws.styleMol` (action)
// in `workspace_panel_ctxtmenu.js`. The submenu lists styles registered
// in `StyleManager` filtered by `<type_name>$/i` (global + scene-local),
// optionally followed by `/^EgLine/` edge styles for renderer types that
// support them.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { remove as styleRemove, push as stylePush } from './helpers/styleutil';

// ─── getRendererStyleEntries ──────────────────────────────────────────────

export interface GetRendererStyleEntriesArgs {
    sceneId: number;
    rendId: number;
}

export interface RendererStyleEntry {
    /** Raw style name (e.g. "DefaultCartoon"). Action dispatches `style-${name}`. */
    name: string;
    /** Human-friendly label — StyleSet `desc` when present, otherwise the raw name. */
    label: string;
    /** Regex source used to strip existing entries before pushing the new one. */
    pattern: string;
    /** Regex flags matching `pattern`. */
    flags: string;
}

export interface GetRendererStyleEntriesResult {
    ok: boolean;
    /** Type-suffix matched styles (regex `<type_name>$/i`). */
    typeStyles: RendererStyleEntry[];
    /** Edge styles (regex `/^EgLine/`). Empty for excluded renderer types. */
    edgeStyles: RendererStyleEntry[];
}

interface RawStyleEntry {
    name?: string;
    desc?: string;
    type?: string;
}

/**
 * Renderer types that don't get the edge-style group. Mirrors UXP
 * `onStyleShowing`'s explicit blocklist (`coutour` is a typo in UXP, kept
 * verbatim because the runtime list is gated on the renderer's own
 * `type_name` string which may match the typo).
 */
const EDGE_BLOCKLIST = new Set<string>([
    'simple', 'trace', 'spline', '*namelabel', '*selection', 'coutour',
]);

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

function entriesMatching(
    raw: RawStyleEntry[],
    re: RegExp,
    pattern: string,
    flags: string,
): RendererStyleEntry[] {
    const out: RendererStyleEntry[] = [];
    for (const r of raw) {
        const name = typeof r?.name === 'string' ? r.name : '';
        if (!name || !re.test(name)) continue;
        const desc = typeof r?.desc === 'string' ? r.desc : '';
        out.push({ name, label: desc || name, pattern, flags });
    }
    return out;
}

function getRendererTypeName(rend: Renderer): string {
    try {
        return (rend as unknown as { type_name: string }).type_name ?? '';
    } catch {
        return '';
    }
}

function getRendererStyleEntries(
    ctx: WorkerContext,
    args: GetRendererStyleEntriesArgs,
): GetRendererStyleEntriesResult {
    const empty: GetRendererStyleEntriesResult = {
        ok: false, typeStyles: [], edgeStyles: [],
    };
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return empty;
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return empty;
    const typeName = getRendererTypeName(rend);
    if (!typeName) return empty;

    const raw = [
        ...fetchStyleEntries(ctx, 0),
        ...fetchStyleEntries(ctx, args.sceneId),
    ];

    const typePattern = `${escapeForRegExp(typeName)}$`;
    const typeFlags = 'i';
    const typeRe = new RegExp(typePattern, typeFlags);
    const typeStyles = entriesMatching(raw, typeRe, typePattern, typeFlags);

    let edgeStyles: RendererStyleEntry[] = [];
    if (!EDGE_BLOCKLIST.has(typeName)) {
        const edgePattern = '^EgLine';
        const edgeFlags = '';
        const edgeRe = new RegExp(edgePattern, edgeFlags);
        edgeStyles = entriesMatching(raw, edgeRe, edgePattern, edgeFlags);
    }

    return { ok: true, typeStyles, edgeStyles };
}

/**
 * Escape regex metacharacters in the renderer type name. type_name values
 * contain `*` for synthetic renderers (e.g. `*selection`) which would
 * otherwise be a quantifier in a RegExp.
 */
function escapeForRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── applyRendererStyle ───────────────────────────────────────────────────

export interface ApplyRendererStyleArgs {
    sceneId: number;
    rendId: number;
    /** Raw style name to push (without the `style-` prefix). */
    styleName: string;
    /** Regex source used to strip pre-existing entries. */
    pattern: string;
    /** Regex flags. */
    flags: string;
}

export interface ApplyRendererStyleResult {
    ok: boolean;
}

function applyRendererStyle(
    ctx: WorkerContext,
    args: ApplyRendererStyleArgs,
): ApplyRendererStyleResult {
    if (!args.styleName) return { ok: false };
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };

    let removeRe: RegExp;
    try {
        removeRe = new RegExp(args.pattern, args.flags);
    } catch {
        return { ok: false };
    }

    const cur = rend.style ?? '';
    const stripped = styleRemove(cur, removeRe);
    const next = stylePush(stripped, args.styleName);

    withUndoTxn(scene, 'Change style', () => {
        rend.applyStyles(next);
    });
    return { ok: true };
}

// ─── getRendererStyleEditInfo (Phase 6c — Edit style dialog) ──────────────
//
// Full info needed to drive the "Edit Renderer Style" dialog (UXP
// `apply_rend_style.xul`). Unlike `getRendererStyleEntries` (single-pick
// Style submenu), this returns:
//   - current style list parsed from `rend.style` ("a,b c" → ["a","b","c"])
//   - available styles grouped into three sections, mirroring UXP
//     `populateAddMenu`: type-suffix match, edge match, coloring match.
//     Each section already excludes names already in the current list,
//     so the dialog can render the Add popup directly.

export interface GetRendererStyleEditInfoArgs {
    sceneId: number;
    rendId: number;
}

export interface RendererStyleNameEntry {
    /** Raw style name (used as the value when adding to the list). */
    name: string;
    /** Display label: `<name> (<desc>)` when `desc` is set, else `<name>`. */
    label: string;
}

export interface GetRendererStyleEditInfoResult {
    ok: boolean;
    rendName: string;
    rendTypeName: string;
    /** Ordered list of style names currently applied (`rend.style` split). */
    currentStyles: string[];
    /** Available styles whose name matches `<type_name>$/i`. */
    typeMatch: RendererStyleNameEntry[];
    /** Available styles whose name matches `^EgLine` (empty for blocklisted types). */
    edgeMatch: RendererStyleNameEntry[];
    /** Available styles whose name matches `(Coloring|Paint)$`, only when renderer has `coloring`. */
    coloringMatch: RendererStyleNameEntry[];
}

function parseStyleList(styleStr: string): string[] {
    if (!styleStr) return [];
    return styleStr
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function rendererHasColoring(rend: Renderer): boolean {
    return 'coloring' in (rend as unknown as Record<string, unknown>);
}

function entriesMatchingNames(
    raw: RawStyleEntry[],
    re: RegExp,
    exclude: Set<string>,
): RendererStyleNameEntry[] {
    const out: RendererStyleNameEntry[] = [];
    for (const r of raw) {
        const name = typeof r?.name === 'string' ? r.name : '';
        if (!name || exclude.has(name) || !re.test(name)) continue;
        const desc = typeof r?.desc === 'string' ? r.desc : '';
        out.push({ name, label: desc ? `${name} (${desc})` : name });
    }
    return out;
}

function getRendererStyleEditInfo(
    ctx: WorkerContext,
    args: GetRendererStyleEditInfoArgs,
): GetRendererStyleEditInfoResult {
    const empty: GetRendererStyleEditInfoResult = {
        ok: false, rendName: '', rendTypeName: '',
        currentStyles: [], typeMatch: [], edgeMatch: [], coloringMatch: [],
    };
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return empty;
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return empty;
    const typeName = getRendererTypeName(rend);
    if (!typeName) return empty;

    const rendName =
        (rend as unknown as { name?: string }).name ?? '';

    const cur = (rend as unknown as { style?: string }).style ?? '';
    const currentStyles = parseStyleList(cur);
    const exclude = new Set<string>(currentStyles);

    const raw = [
        ...fetchStyleEntries(ctx, 0),
        ...fetchStyleEntries(ctx, args.sceneId),
    ];

    const typeRe = new RegExp(`${escapeForRegExp(typeName)}$`, 'i');
    const typeMatch = entriesMatchingNames(raw, typeRe, exclude);

    let edgeMatch: RendererStyleNameEntry[] = [];
    if (!EDGE_BLOCKLIST.has(typeName)) {
        edgeMatch = entriesMatchingNames(raw, /^EgLine/, exclude);
    }

    let coloringMatch: RendererStyleNameEntry[] = [];
    if (rendererHasColoring(rend)) {
        coloringMatch = entriesMatchingNames(raw, /(Coloring|Paint)$/, exclude);
    }

    return {
        ok: true,
        rendName,
        rendTypeName: typeName,
        currentStyles,
        typeMatch,
        edgeMatch,
        coloringMatch,
    };
}

// ─── applyRendererStyleList (Phase 6c — Edit style dialog commit) ─────────

export interface ApplyRendererStyleListArgs {
    sceneId: number;
    rendId: number;
    /** Final ordered list of style names. Joined with "," for `applyStyles`. */
    styleNames: string[];
}

export interface ApplyRendererStyleListResult {
    ok: boolean;
}

function applyRendererStyleList(
    ctx: WorkerContext,
    args: ApplyRendererStyleListArgs,
): ApplyRendererStyleListResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };

    const stylestr = args.styleNames
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join(',');

    withUndoTxn(scene, 'Change style', () => {
        rend.applyStyles(stylestr);
    });
    return { ok: true };
}

export const services = {
    getRendererStyleEntries,
    applyRendererStyle,
    getRendererStyleEditInfo,
    applyRendererStyleList,
};
