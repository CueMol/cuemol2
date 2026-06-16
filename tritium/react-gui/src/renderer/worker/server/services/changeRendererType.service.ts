// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase 6b: panel.workspace.ctxmenu.renderer -- "Change type" submenu.
// Mirrors UXP `ws.chgRendType` (non-selection branch) in
// `workspace_panel.js`.
//
// The UXP *selection branch (converting a selection renderer into a
// real renderer via the new-renderer setup dialog) is deliberately
// out of scope here -- the submenu is hidden for synthetic renderers
// at gate time, so the worker only handles concrete-type conversions.

import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { LScrObject } from '@cuemol/core/src/wrappers/LScrObject';
import type { ByteArray } from '@cuemol/core/src/wrappers/ByteArray';
import type { WorkerContext } from '../types/WorkerContext';
import { getDefaultStyleName } from './helpers/getDefaultStyleName';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';

export interface ChangeRendererTypeArgs {
    sceneId: number;
    rendId: number;
    /** New renderer type, e.g. 'cartoon'. */
    newType: string;
}

export interface ChangeRendererTypeResult {
    ok: boolean;
    /** Uid of the new renderer on success. */
    newRendId?: number;
    /** Final name carried over from the old renderer. */
    newName?: string;
}

function getTypeName(rend: Renderer): string {
    try {
        return (rend as unknown as { type_name: string }).type_name ?? '';
    } catch {
        return '';
    }
}

function getUiOrder(rend: Renderer): number | null {
    try {
        const v = (rend as unknown as { ui_order: number }).ui_order;
        return typeof v === 'number' ? v : null;
    } catch {
        return null;
    }
}

/** UXP gate: hide for `*`-prefixed (except *selection which has its
 *  own conversion path we don't migrate here) plus atomintr / disorder. */
function isSyntheticType(name: string): boolean {
    return name.startsWith('*') || name === 'atomintr' || name === 'disorder';
}

function changeRendererType(
    ctx: WorkerContext,
    args: ChangeRendererTypeArgs,
): ChangeRendererTypeResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = scene.getRenderer(args.rendId) as Renderer | null;
    if (!rend) return { ok: false };
    const obj = rend.getClientObj() as CueMolObject | null;
    if (!obj) return { ok: false };

    const oldType = getTypeName(rend);
    if (!oldType) return { ok: false };
    // Renderer.ui_order is (nopersist), so the toXML2/fromXML round-trip
    // below drops it. Capture it before the old renderer is destroyed.
    const savedUiOrder = getUiOrder(rend);
    if (isSyntheticType(oldType)) return { ok: false };
    if (!args.newType || isSyntheticType(args.newType)) return { ok: false };
    if (args.newType === oldType) return { ok: false };

    // Serialize the existing renderer under the new type tag so its
    // common renderer state (sel, group, etc.) is carried over.
    const xml = ctx.strMgr.toXML2(rend as unknown as LScrObject, args.newType) as
        | ByteArray | null;
    if (!xml) return { ok: false };
    const restored = ctx.strMgr.fromXML(xml, args.sceneId) as LScrObject | null;
    if (!restored) return { ok: false };
    const newRend = restored as unknown as Renderer;

    // Restore the display order dropped by the XML round-trip. A freshly
    // created renderer initialises ui_order to its (new, larger) uid, so
    // without this the renderer would sort to the end of the object's
    // list and visibly jump position on a type change.
    if (savedUiOrder !== null) {
        try {
            (newRend as unknown as { ui_order: number }).ui_order = savedUiOrder;
        } catch (e) {
            console.warn('copying ui_order to new renderer failed:', e);
        }
    }

    // Apply default-style preset for the new type (matches UXP
    // `setDefaultStyles`). This runs before attach so the initial
    // attach lands with the right look.
    try {
        newRend.applyStyles(getDefaultStyleName(args.newType));
    } catch (e) {
        console.warn('applyStyles for new renderer type failed:', e);
    }

    let newRendId = -1;
    let newName = '';
    withUndoTxn(scene, 'Change rend type', () => {
        obj.destroyRenderer(args.rendId);
        obj.attachRenderer(newRend);
        newRendId = (newRend as unknown as { uid: number }).uid ?? -1;
        try {
            newName = newRend.name ?? '';
        } catch {
            newName = '';
        }
    });

    if (newRendId < 0) return { ok: false };
    return { ok: true, newRendId, newName };
}

export const services = {
    changeRendererType,
};
