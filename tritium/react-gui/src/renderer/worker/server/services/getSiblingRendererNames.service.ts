// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Returns the names of renderers attached to the SAME parent object as a given
// renderer, filtered to a set of type names. Backs the "Target" selector of the
// disorder renderer property page (UXP `disorder-propdlg` `getRendNameList`),
// where the disorder overlay must point at a sibling main-chain renderer
// (tube / ribbon / cartoon / nucl). Mirrors UXP `cuemol.getRendNameList`.

import type { Object as CueObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import { listRendererNamesByType } from '@renderer/worker/server/services/helpers/rendererNames';

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

    return { names: listRendererNamesByType(parent, args.typeNames) };
}

export const services = { getSiblingRendererNames };
