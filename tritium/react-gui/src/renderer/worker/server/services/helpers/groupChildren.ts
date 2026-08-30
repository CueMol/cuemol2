/**
 * @file worker/server/services/helpers/groupChildren.ts
 * @description Renderer-group membership helpers shared by the scene-tree
 * worker services (visibility cascade, group rename, deep copy/paste,
 * DnD reorder).
 *
 * Group membership in CueMol is a loose name reference: a renderer belongs
 * to the group whose `name` equals the renderer's `group` string property
 * (C++ RendGroup keeps no child list -- see qsys/RendGroup.cpp getCenter).
 * These helpers read the live C++ state rather than the renderer-side tree
 * snapshot, which may be stale behind the debounced refetch.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import { safeRead } from './safeRead';

/**
 * Enumerate all renderers attached to `obj` (groups included), resolved
 * through the scene. Order follows `rend_uids` (ui_order ascending).
 */
export function enumerateObjectRenderers(
    obj: CueMolObject,
    scene: Scene,
): Renderer[] {
    let csv = '';
    try {
        csv = obj.rend_uids;
    } catch {
        return [];
    }
    if (!csv) return [];
    const out: Renderer[] = [];
    for (const part of csv.split(',')) {
        const uid = parseInt(part.trim(), 10);
        if (!Number.isFinite(uid)) continue;
        const rend = scene.getRenderer(uid) as Renderer | null;
        if (rend) out.push(rend);
    }
    return out;
}

/**
 * List the member renderers of a renderer group: siblings on the group's
 * client object whose `group` string equals the group's name. The group
 * renderer itself is excluded. Mirrors the C++ membership scan in
 * qsys/RendGroup.cpp (getCenter / hasCenter).
 */
export function listGroupChildRenderers(scene: Scene, grp: Renderer): Renderer[] {
    const obj = safeRead(() => grp.getClientObj() as CueMolObject | null) ?? null;
    if (!obj) return [];
    const grpName = safeRead(() => grp.name) ?? '';
    if (grpName === '') return [];
    const grpUid = safeRead(() => grp.uid);
    return enumerateObjectRenderers(obj, scene).filter((r) => {
        if (safeRead(() => r.uid) === grpUid) return false;
        return (safeRead(() => r.group) ?? '') === grpName;
    });
}
