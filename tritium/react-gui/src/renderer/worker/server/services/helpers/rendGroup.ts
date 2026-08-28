/**
 * @file renderer/worker/server/services/helpers/rendGroup.ts
 * @description Guards for renderer-group membership writes.
 *
 * Group membership is a loose name reference: a renderer belongs to the group
 * whose `name` equals its own `group` string (see helpers/groupChildren.ts).
 * Nothing in C++ validates that string, and `Renderer.group` is an ordinary
 * writable property that the Inspector exposes like any other.
 *
 * That makes two writes silently destructive, because
 * `Object::getGroupedRendListJSON` skips every renderer with a non-empty
 * `group` at top level and only re-emits it under a group whose name matches:
 *
 *   - a name that matches no group ("Gx", a typo, or a group deleted in the
 *     meantime) removes the renderer from the scene tree for good. It keeps
 *     drawing in 3D but cannot be selected, hidden or deleted, because every
 *     one of those paths starts from the tree.
 *   - a group placed inside another group disappears the same way: the C++
 *     JSON is one level deep, so the inner group's own members match no
 *     filter. The renderer-side DnD planner already refuses this
 *     (components/panes/sceneTreeDnd.ts); the Inspector bypassed it.
 *
 * Both are rejected here instead, so a bad value fails the service call and
 * leaves the scene untouched.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import { safeRead } from './safeRead';
import { enumerateObjectRenderers, listGroupChildRenderers } from './groupChildren';

/** C++ type name of a renderer group. */
export const REND_GROUP_TYPE = '*group';

/** Whether `rend` is a renderer group rather than a leaf renderer. */
export function isRendGroup(rend: Renderer): boolean {
    return (safeRead(() => rend.type_name) ?? '') === REND_GROUP_TYPE;
}

/**
 * Check whether `target` may be moved into the group named `groupName`.
 *
 * @param scene - scene owning both renderers.
 * @param target - the renderer whose `group` property would be written.
 * @param groupName - requested group name; `''` means "no group" and is
 *   always allowed.
 * @returns `null` when the write is safe, otherwise a reason for the caller
 *   to report.
 */
export function checkGroupAssignment(
    scene: Scene,
    target: Renderer,
    groupName: string,
): string | null {
    const name = groupName.trim();
    if (name === '') return null;

    if (isRendGroup(target)) {
        return 'renderer groups cannot be nested';
    }

    const client = safeRead(() => target.getClientObj() as CueMolObject | null) ?? null;
    if (!client) return 'renderer has no client object';

    const targetUid = safeRead(() => target.uid);
    const match = enumerateObjectRenderers(client, scene).find(
        (r) =>
            safeRead(() => r.uid) !== targetUid &&
            isRendGroup(r) &&
            (safeRead(() => r.name) ?? '') === name,
    );
    if (!match) return `no renderer group named "${name}" on this object`;
    return null;
}

/**
 * Uids to destroy along with a renderer group: the live members plus anything
 * the caller's tree snapshot listed, de-duplicated.
 *
 * Deleting a group has to take its members with it. Reading them only from the
 * snapshot the renderer sent leaves any renderer moved into the group since
 * that fetch behind, with `group` still naming a destroyed group -- which is
 * exactly the unreachable state `checkGroupAssignment` exists to prevent.
 *
 * @param scene - scene owning the group.
 * @param grp - the group renderer being destroyed.
 * @param snapshotIds - member uids as the caller saw them; may be undefined.
 * @returns member uids, each appearing once.
 */
export function collectGroupMemberUids(
    scene: Scene,
    grp: Renderer,
    snapshotIds?: readonly number[],
): number[] {
    const uids = new Set<number>();
    for (const child of listGroupChildRenderers(scene, grp)) {
        const uid = safeRead(() => child.uid);
        if (typeof uid === 'number') uids.add(uid);
    }
    for (const uid of snapshotIds ?? []) uids.add(uid);
    const grpUid = safeRead(() => grp.uid);
    if (typeof grpUid === 'number') uids.delete(grpUid);
    return [...uids];
}
