// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Create Renderer Style dialog support.
//
// UXP source:
//   - `style/rendstyle_create.xul` / `rendstyle_create.js` -- dialog UI
//   - `workspace_panel_ctxtmenu.js` `onCreateStyle` -- caller that opens
//     the dialog and then calls
//     `StyleManager.createStyleFromObj(scene.uid, ssetid, name+typeName, rend)`
//
// Two worker services:
//   - `getCreateRendStyleInfo` -- pre-fetches renderer + writable style-set
//     list (filters out readonly + the global "system" set, matching
//     `populateStyleSetList`). Defaults the selection to the scene-local
//     set when one exists.
//   - `createStyleFromRenderer` -- calls `StyleManager.createStyleFromObj`.
//     C++ overwrites a same-name node internally (UXP's confirm prompt is
//     a UI nicety; we drop it in favour of the same auto-handle pattern
//     used by object / renderer / style paste paths).

import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { LScrObject } from '@cuemol/core/src/wrappers/LScrObject';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';

// --- getCreateRendStyleInfo ---

export interface GetCreateRendStyleInfoArgs {
    sceneId: number;
    rendId: number;
}

export interface WritableStyleSetEntry {
    /** StyleSet uid (use as the `setUid` argument when committing). */
    uid: number;
    /** Display name; empty becomes "(anonymous)" in the UI layer. */
    name: string;
    /** Scope id (0 = global, scene.uid = scene-local). */
    scopeId: number;
}

export interface GetCreateRendStyleInfoResult {
    ok: boolean;
    rendName: string;
    rendTypeName: string;
    /** Writable style sets -- readonly sets + the global "system" set are filtered out. */
    styleSets: WritableStyleSetEntry[];
    /**
     * Pre-selected uid: scene-local set when one is writable, otherwise
     * the first entry's uid, otherwise -1. UI keys to this for the
     * initial selection.
     */
    defaultSelectedUid: number;
}

interface StyleSetsJSONEntry {
    name?: string;
    uid?: number;
    scene_id?: number;
    src?: string;
    readonly?: boolean;
    modified?: boolean;
}

function fetchStyleSets(
    ctx: WorkerContext,
    scopeId: number,
): StyleSetsJSONEntry[] {
    try {
        const mgr = ctx.svc.getService('StyleManager') as unknown as
            | { getStyleSetsJSON?: (id: number) => string }
            | null;
        if (!mgr?.getStyleSetsJSON) return [];
        const json = mgr.getStyleSetsJSON(scopeId);
        if (!json) return [];
        const parsed = JSON.parse(json) as unknown;
        return Array.isArray(parsed) ? (parsed as StyleSetsJSONEntry[]) : [];
    } catch {
        return [];
    }
}

function getRendererInfo(rend: Renderer): { name: string; typeName: string } {
    const r = rend as unknown as { name?: string; type_name?: string };
    return { name: r.name ?? '', typeName: r.type_name ?? '' };
}

export function getCreateRendStyleInfo(
    ctx: WorkerContext,
    args: GetCreateRendStyleInfoArgs,
): GetCreateRendStyleInfoResult {
    const empty: GetCreateRendStyleInfoResult = {
        ok: false, rendName: '', rendTypeName: '',
        styleSets: [], defaultSelectedUid: -1,
    };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return empty;
    const { name: rendName, typeName: rendTypeName } = getRendererInfo(rend);
    if (!rendTypeName) return empty;

    const raw = [
        ...fetchStyleSets(ctx, 0),
        ...fetchStyleSets(ctx, args.sceneId),
    ];

    const styleSets: WritableStyleSetEntry[] = [];
    let sceneLocalUid = -1;
    for (const e of raw) {
        if (e.readonly === true) continue;
        const scopeId = e.scene_id ?? 0;
        const name = e.name ?? '';
        // UXP `populateStyleSetList` skips the global "system" set even
        // when not marked readonly.
        if (name === 'system' && scopeId === 0) continue;
        const uid = e.uid;
        if (typeof uid !== 'number') continue;
        styleSets.push({ uid, name, scopeId });
        if (scopeId !== 0 && sceneLocalUid === -1) sceneLocalUid = uid;
    }

    const defaultSelectedUid =
        sceneLocalUid !== -1
            ? sceneLocalUid
            : styleSets[0]?.uid ?? -1;

    return {
        ok: true,
        rendName,
        rendTypeName,
        styleSets,
        defaultSelectedUid,
    };
}

// --- createStyleFromRenderer ---

export interface CreateStyleFromRendererArgs {
    sceneId: number;
    rendId: number;
    /** Target StyleSet uid (from `getCreateRendStyleInfo.styleSets`). */
    setUid: number;
    /**
     * User-entered base name -- the worker appends the renderer's
     * `type_name` to form the final style name, matching UXP's
     * `args.style_name = res_name + this.mRendTypeName`.
     */
    baseName: string;
}

export interface CreateStyleFromRendererResult {
    ok: boolean;
    /** Final style name actually written (`baseName + typeName`), or "". */
    styleName: string;
}

export function createStyleFromRenderer(
    ctx: WorkerContext,
    args: CreateStyleFromRendererArgs,
): CreateStyleFromRendererResult {
    const empty: CreateStyleFromRendererResult = { ok: false, styleName: '' };
    const baseName = args.baseName.trim();
    if (baseName.length === 0) return empty;

    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return empty;
    const { typeName } = getRendererInfo(rend);
    if (!typeName) return empty;

    const mgr = ctx.svc.getService('StyleManager') as unknown as
        | {
              createStyleFromObj: (
                  sceneId: number,
                  setUid: number,
                  name: string,
                  obj: LScrObject,
              ) => void;
          }
        | null;
    if (!mgr) return empty;

    const styleName = `${baseName}${typeName}`;

    try {
        mgr.createStyleFromObj(
            args.sceneId,
            args.setUid,
            styleName,
            rend as unknown as LScrObject,
        );
    } catch {
        return empty;
    }
    // UXP does not wrap createStyleFromObj in an undo txn -- the
    // StyleManager fires its own pending events. Match that behaviour.
    return { ok: true, styleName };
}
