// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Resolves a scene-tree node identity into the C++ wrapper whose properties
// the generic property inspector edits. Uses the same per-type lookup
// (object / renderer / style / scene) as the scene-tree node services, but
// returns the wrapper itself so the caller can invoke
// `getPropsJSON` / `setProp` / `resetProp` on it.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { WorkerContext } from '../../types/WorkerContext';
import type { SceneNodeType } from '@renderer/worker/shared/sceneTreeTypes';

/**
 * Node kinds the generic property inspector can target. Extends the
 * scene-tree `SceneNodeType` with `view` - the View has no scene-tree
 * node (it is reached via the View menu) but its properties are edited
 * through the same generic path.
 */
export type PropTargetType = SceneNodeType | 'view';

export interface PropTargetRef {
    sceneId: number;
    nodeId: number;
    nodeType: PropTargetType;
}

export interface ResolvedPropTarget {
    /** The owning scene - needed to wrap writes in an undo transaction. */
    scene: Scene | null;
    /** The wrapper whose properties are edited; null when unsupported. */
    target: BaseWrapper | null;
}

/**
 * Resolve a node reference into `{ scene, target }`.
 *
 * Supported node types: `scene`, `object`, `renderer`, `rendGroup`
 * (RendGroup extends Renderer in C++ - `scene.getRenderer` returns both),
 * and `view` (`sceMgr.getView` - reached via the View menu, not the tree).
 * `camera` / `style` / root nodes return `target: null` - generic property
 * editing for them is deferred to a later stage.
 */
export function resolvePropTarget(
    ctx: WorkerContext,
    ref: PropTargetRef,
): ResolvedPropTarget {
    const scene = ctx.sceMgr.getScene(ref.sceneId) as Scene | null;
    if (!scene) return { scene: null, target: null };

    switch (ref.nodeType) {
        case 'scene':
            return { scene, target: scene as unknown as BaseWrapper };
        case 'object':
            return {
                scene,
                target: scene.getObject(ref.nodeId) as unknown as BaseWrapper | null,
            };
        case 'renderer':
        case 'rendGroup':
            return {
                scene,
                target: scene.getRenderer(ref.nodeId) as unknown as BaseWrapper | null,
            };
        case 'view':
            return {
                scene,
                target: ctx.sceMgr.getView(ref.nodeId) as unknown as BaseWrapper | null,
            };
        default:
            // camera / style / cameraRoot / styleRoot: not supported yet.
            return { scene, target: null };
    }
}
