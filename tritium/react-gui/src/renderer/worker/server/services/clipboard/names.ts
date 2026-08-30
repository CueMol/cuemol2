/**
 * @file worker/server/services/clipboard/names.ts
 * @description Picking a free name for a pasted node.
 *
 * Five kinds of node, five things that count as "already taken" -- an
 * object's name is scene-wide, a renderer's is per object, a group's is
 * scene-wide because it is the membership key, a style set's is per scope.
 * Only the test differs; the search is the same, so it is written once.
 *
 * The suffix here is `_1`, not the `(1)` that `helpers/uniqName` produces for
 * newly created objects. The two are not interchangeable: the suffix shows up
 * in the scene tree, and paste has always named this way.
 */

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';

/**
 * First free name from `prefix` and then the numbered candidates.
 *
 * @param taken - whether a candidate is already in use
 * @param candidate - how to build the i-th candidate
 * @returns the first free name; after 10000 tries, a timestamped one (which
 *   is unique for any purpose this serves)
 */
function pickName(
    prefix: string,
    taken: (name: string) => boolean,
    candidate: (i: number) => string,
): string {
    if (!taken(prefix)) return prefix;
    for (let i = 1; i < 10000; i++) {
        const name = candidate(i);
        if (!taken(name)) return name;
    }
    return `${prefix}_${Date.now()}`;
}

/** Numbered by suffix: `name`, `name_1`, `name_2`, ... */
const suffixed = (prefix: string) => (i: number) => `${prefix}_${i}`;

/** A name no object in the scene has. */
export function uniqueObjectName(scene: Scene, prefix: string): string {
    return pickName(prefix, (n) => !!scene.getObjectByName(n), suffixed(prefix));
}

/**
 * A name no renderer in the scene has. Group names are scene-wide unique
 * because they are the membership key (same gate as createRendererGroup and
 * rendGroup rename).
 */
export function uniqueGroupName(scene: Scene, prefix: string): string {
    return pickName(
        prefix,
        (n) => !!safeRead(() => scene.getRendByName(n)),
        suffixed(prefix),
    );
}

/** A name no renderer of this object has. */
export function uniqueRendererName(obj: CueMolObject, prefix: string): string {
    const byName = (obj as unknown as { getRendererByName: (s: string) => unknown });
    return pickName(prefix, (n) => !!byName.getRendererByName(n), suffixed(prefix));
}

/** A name no camera in the scene has. Cameras are numbered by prefix. */
export function uniqueCameraNameViaScene(scene: Scene, base: string): string {
    return pickName(base, (n) => scene.hasCamera(n), (i) => `copy${i}_${base}`);
}

/** A name no style set in this scope has. */
export function uniqueStyleName(
    mgr: { hasStyleSet: (name: string, scopeId: number) => number },
    prefix: string,
    scopeId: number,
): string {
    return pickName(prefix, (n) => mgr.hasStyleSet(n, scopeId) !== 0, suffixed(prefix));
}
