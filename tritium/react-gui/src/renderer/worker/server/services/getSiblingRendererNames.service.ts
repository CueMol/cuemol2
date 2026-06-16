// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Returns the names of renderers attached to the SAME parent object as a given
// renderer, filtered to a set of type names. Backs the "Target" selector of the
// disorder renderer property page (UXP `disorder-propdlg` `getRendNameList`),
// where the disorder overlay must point at a sibling main-chain renderer
// (tube / ribbon / cartoon / nucl). Mirrors UXP `cuemol.getRendNameList`.

import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { Object as CueObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '../types/WorkerContext';
import { safeRead } from './helpers/safeRead';

export interface GetSiblingRendererNamesArgs {
    /** Scene scope. */
    sceneId: number;
    /** UID of the renderer whose parent object's siblings are enumerated. */
    nodeId: number;
    /** Renderer `type_name` values to include (e.g. tube / ribbon / cartoon). */
    typeNames: string[];
}

export interface GetSiblingRendererNamesResult {
    /** Sibling renderer names matching `typeNames`, in attachment order. */
    names: string[];
}


function getSiblingRendererNames(
    ctx: WorkerContext,
    args: GetSiblingRendererNamesArgs,
): GetSiblingRendererNamesResult {
    const empty: GetSiblingRendererNamesResult = { names: [] };
    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return empty;

    const rend = scene.getRenderer(args.nodeId) as unknown as Renderer | null;
    if (!rend) return empty;

    // The disorder renderer is attached to a MolCoord; enumerate that parent's
    // renderers (UXP `rend.getClientObj()` + `getRendNameList`).
    const parent = safeRead(() => rend.getClientObj()) as unknown as CueObject | undefined;
    if (!parent) return empty;

    const wanted = new Set(args.typeNames);
    const out: string[] = [];
    const count = safeRead(() => parent.getRendCount()) ?? 0;
    for (let i = 0; i < count; ++i) {
        const sibling = safeRead(() => parent.getRendererByIndex(i)) as
            | (BaseWrapper & { type_name: string; name: string })
            | undefined;
        if (!sibling) continue;
        const typeName = safeRead(() => sibling.type_name);
        if (typeName === undefined || !wanted.has(typeName)) continue;
        const name = safeRead(() => sibling.name);
        if (name) out.push(name);
    }
    return { names: out };
}

export const services = { getSiblingRendererNames };
