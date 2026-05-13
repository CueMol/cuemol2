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

export const services = {
    getRendererStyleEntries,
    applyRendererStyle,
};
