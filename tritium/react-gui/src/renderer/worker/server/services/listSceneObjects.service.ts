/**
 * @file worker/server/services/listSceneObjects.service.ts
 * @description Unified scene-object enumeration for the `ObjectSelect`
 * widget. Returns every top-level object node (`type === 'object'`) in
 * the scene with its uid / name / className; the widget filters
 * client-side via its `filter` predicate, so any consumer
 * (Molecule selector, Symmetry selector, future dialog pickers) can
 * declare its filter inline without a dedicated worker service.
 *
 * Replaces the earlier `listMols` / `listSymmetryObjects` services,
 * which each baked one specific filter into the worker.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { parseSceneTreeJSON } from '@renderer/worker/shared/sceneTreeTypes';

export interface ListSceneObjectsArgs {
    sceneId: number;
}

export interface SceneObjectEntry {
    /** C++ uid of the object. */
    uid: number;
    /** Display name (empty string if the object has no name set). */
    name: string;
    /** C++ class name (e.g. "MolCoord", "PDBMol", "DensityMap"). */
    className: string;
}

export interface ListSceneObjectsResult {
    objects: SceneObjectEntry[];
}

function listSceneObjects(
    ctx: WorkerContext,
    args: ListSceneObjectsArgs,
): ListSceneObjectsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { objects: [] };

    let json: string;
    try {
        json = scene.getSceneDataJSON();
    } catch {
        return { objects: [] };
    }
    const tree = parseSceneTreeJSON(json);
    if (!tree) return { objects: [] };

    const out: SceneObjectEntry[] = [];
    for (const node of tree.children) {
        if (node.type !== 'object') continue;
        out.push({ uid: node.id, name: node.name, className: node.className });
    }
    return { objects: out };
}

export const services = { listSceneObjects };
