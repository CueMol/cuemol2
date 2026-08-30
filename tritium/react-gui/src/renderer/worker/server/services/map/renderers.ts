/**
 * @file worker/server/services/map/renderers.ts
 * @description Which renderers in a scene are density maps.
 *
 * Walks the scene tree rather than asking each object, because a map
 * renderer can sit inside a renderer group and the panel lists it either way.
 */
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { parseSceneTreeJSON } from '@renderer/worker/shared/sceneTreeTypes';
import type {
    ListMapRenderersArgs,
    ListMapRenderersResult,
    MapRendererEntry,
} from './types';
import { MAP_RENDERER_TYPES } from './types';
/**
 * Walk the scene tree and collect every renderer whose type matches the
 * UXP map-renderer filter. Renderers nested inside renderer groups are
 * included via `childNodes`.
 */
export function listMapRenderers(
    ctx: WorkerContext,
    args: ListMapRenderersArgs,
): ListMapRenderersResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { items: [] };

    let json: string;
    try {
        json = scene.getSceneDataJSON();
    } catch {
        return { items: [] };
    }
    const tree = parseSceneTreeJSON(json);
    if (!tree) return { items: [] };

    const out: MapRendererEntry[] = [];
    for (const obj of tree.children) {
        if (obj.type !== 'object') continue;
        collectMapRenderers(obj.children, obj.id, obj.name, out);
    }
    return { items: out };
}

/**
 * Recursive helper that flattens an object's renderer subtree
 * (renderer + rendGroup nodes) into the MAP_RENDERER_TYPES filter.
 */
export function collectMapRenderers(
    nodes: Array<{
        id: number;
        name: string;
        type: string;
        className: string;
        children: Array<unknown>;
    }>,
    objId: number,
    objName: string,
    out: MapRendererEntry[],
): void {
    for (const n of nodes) {
        if (n.type === 'renderer' && MAP_RENDERER_TYPES.has(n.className)) {
            out.push({
                rendId: n.id,
                rendName: n.name,
                type: n.className,
                objId,
                objName,
            });
        } else if (n.type === 'rendGroup') {
            collectMapRenderers(
                n.children as Array<{
                    id: number;
                    name: string;
                    type: string;
                    className: string;
                    children: Array<unknown>;
                }>,
                objId,
                objName,
                out,
            );
        }
    }
}
