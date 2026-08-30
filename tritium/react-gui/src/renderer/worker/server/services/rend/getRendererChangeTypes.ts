// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// pre-fetch list of compatible renderer types for the
// "Change type" submenu on `panel.workspace.ctxmenu.renderer`.
// Mirrors UXP `ws.onChgRendTypeShowing` filter logic in
// `workspace_panel.js`.

import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { isLegacyRendererType } from '@renderer/worker/server/services/helpers/rendererFilter';

export interface GetRendererChangeTypesArgs {
    sceneId: number;
    rendId: number;
}

export interface GetRendererChangeTypesResult {
    /** Selectable replacement type names (current type + synthetic filtered out). */
    typeNames: string[];
}

function getTypeName(rend: Renderer): string {
    try {
        return (rend as unknown as { type_name: string }).type_name ?? '';
    } catch {
        return '';
    }
}

export function getRendererChangeTypes(
    ctx: WorkerContext,
    args: GetRendererChangeTypesArgs,
): GetRendererChangeTypesResult {
    const empty: GetRendererChangeTypesResult = { typeNames: [] };
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return empty;
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return empty;

    const currentType = getTypeName(rend);
    // UXP gate: the submenu itself is suppressed for synthetic and
    // atomintr / disorder source renderers, so an empty list here
    // doubles as the visibility gate.
    if (!currentType) return empty;
    if (currentType.startsWith('*') && currentType !== '*selection') return empty;
    if (currentType === 'atomintr' || currentType === 'disorder') return empty;
    // *selection has its own conversion path (UXP setupRend dialog)
    // that we do not migrate -- gate it out too.
    if (currentType === '*selection') return empty;

    const obj = rend.getClientObj() as CueMolObject | null;
    if (!obj) return empty;

    let listStr = '';
    try {
        listStr = obj.searchCompatibleRendererNames();
    } catch {
        return empty;
    }
    if (!listStr) return empty;

    const typeNames = listStr
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => {
            if (!s) return false;
            if (s === currentType) return false;
            if (s.startsWith('*')) return false;
            if (s === 'atomintr' || s === 'disorder') return false;
            if (isLegacyRendererType(s)) return false;
            return true;
        });

    return { typeNames };
}
