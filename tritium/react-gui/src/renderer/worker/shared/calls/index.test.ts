/**
 * @file worker/shared/calls/index.test.ts
 * @description Keeps the ServiceMap slices honest against the worker.
 *
 * The map is now assembled from one file per domain, which introduces two
 * ways to drift that a single file could not have: a key can appear in two
 * slices, and a slice can list a key the worker never registers (or miss one
 * it does). The type system catches neither -- `extends` only rejects a
 * conflicting *type*, and a service registers by string name.
 *
 * The registry side is read the same way the worker reads it
 * (`import.meta.glob` over `*.service.ts` -> each module's `services` export),
 * so this compares the declared contract with what actually gets registered.
 */

import { describe, it, expect } from 'vitest';
import {
    ALL_SERVICE_KEYS,
    APP_KEYS, SCENE_KEYS, UNDO_KEYS, SCENE_TREE_KEYS, PROPS_KEYS, FILE_KEYS,
    RENDER_KEYS, VIEW_KEYS, COLOR_KEYS, COLORING_KEYS, REND_KEYS, STYLE_KEYS,
    CAMERA_KEYS, SELECT_KEYS, NAVI_KEYS, MOLOPS_KEYS, APBS_KEYS, MAP_KEYS,
    ANIM_KEYS, TRAJ_KEYS,
} from './index';

const SLICES: Record<string, readonly string[]> = {
    app: APP_KEYS, scene: SCENE_KEYS, undo: UNDO_KEYS, sceneTree: SCENE_TREE_KEYS,
    props: PROPS_KEYS, file: FILE_KEYS, render: RENDER_KEYS, view: VIEW_KEYS,
    color: COLOR_KEYS, coloring: COLORING_KEYS, rend: REND_KEYS, style: STYLE_KEYS,
    camera: CAMERA_KEYS, select: SELECT_KEYS, navi: NAVI_KEYS, molops: MOLOPS_KEYS,
    apbs: APBS_KEYS, map: MAP_KEYS, anim: ANIM_KEYS, traj: TRAJ_KEYS,
};

/** Service names the worker registers, read exactly as services/index.ts does. */
function registeredServiceNames(): string[] {
    const modules = import.meta.glob('../../server/services/*.service.ts', {
        eager: true,
    }) as Record<string, { services?: Record<string, unknown> }>;
    const names: string[] = [];
    for (const path of Object.keys(modules).sort()) {
        const services = modules[path]?.services;
        if (!services || typeof services !== 'object') continue;
        for (const [name, fn] of Object.entries(services)) {
            if (typeof fn === 'function') names.push(name);
        }
    }
    return names;
}

describe('ServiceMap slices', () => {
    it('assign every key to exactly one slice', () => {
        const seen = new Map<string, string>();
        const duplicates: string[] = [];
        for (const [slice, keys] of Object.entries(SLICES)) {
            for (const key of keys) {
                const other = seen.get(key);
                if (other !== undefined) duplicates.push(`${key}: ${other} + ${slice}`);
                else seen.set(key, slice);
            }
        }
        expect(duplicates).toEqual([]);
        expect(seen.size).toBe(ALL_SERVICE_KEYS.length);
    });

    it('cover ALL_SERVICE_KEYS exactly', () => {
        const fromSlices = Object.values(SLICES).flat().sort();
        expect(fromSlices).toEqual([...ALL_SERVICE_KEYS].sort());
    });

    it('match the services the worker registers, one for one', () => {
        const registered = registeredServiceNames();
        // A name registered twice would make the later win silently.
        const dupes = registered.filter((n, i) => registered.indexOf(n) !== i);
        expect(dupes).toEqual([]);

        const declared: string[] = [...ALL_SERVICE_KEYS].sort();
        const actual: string[] = [...registered].sort();
        expect(actual.filter((n) => !declared.includes(n))).toEqual([]); // registered, undeclared
        expect(declared.filter((n) => !actual.includes(n))).toEqual([]); // declared, unregistered
    });
});
