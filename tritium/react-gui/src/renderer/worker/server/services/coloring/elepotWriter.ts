/**
 * @file worker/server/services/coloring/elepotWriter.ts
 * @description Elepot deck support: list the scene's ElePotMap objects
 * (`listElePotMapObjects`), write one Elepot property on a surface renderer
 * (`setRendererElepotProp`), and the `findFirstElePotMapName` default-pick
 * helper shared with `setRendererColoring`.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from '@renderer/worker/server/services/withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { makeColor } from '@renderer/worker/server/services/helpers/makeColor';
import { resolveColoringTarget, isElepotCapable } from './colorTargets';
import type {
    ListElePotMapObjectsArgs,
    ListElePotMapObjectsResult,
    ElePotMapObjectEntry,
    SetRendererElepotPropArgs,
    SetRendererElepotPropResult,
} from './types';

/**
 * Walk the scene's top-level objects and return the first ElePotMap's name.
 * Returns "" when the scene has no ElePotMap; mirrors the `mPotSel.getItemCount() > 0`
 * + `getSelectedObj()` fallback in UXP `setDefaultElepot`.
 */
export function findFirstElePotMapName(ctx: WorkerContext, scene: Scene): string {
    try {
        const json = scene.getSceneDataJSON();
        const parsed = JSON.parse(json) as unknown;
        if (!Array.isArray(parsed)) return '';
        for (let i = 1; i < parsed.length; i++) {
            const obj = parsed[i] as { type?: string; name?: string };
            if (obj?.type === 'ElePotMap' && typeof obj.name === 'string') {
                return obj.name;
            }
        }
    } catch {
        // Fall through to empty.
    }
    // `ctx` reserved for future scene-tree helpers; mark as used.
    void ctx;
    return '';
}

/**
 * List all ElePotMap objects in the scene. Drives the Elepot deck's
 * "potential object" dropdown. Mirrors UXP `paint-elepot-obj-selector`
 * which filters on `elem.type === "ElePotMap"`.
 */
export function listElePotMapObjects(
    ctx: WorkerContext,
    args: ListElePotMapObjectsArgs,
): ListElePotMapObjectsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, objects: [] };
    let parsed: unknown;
    try {
        parsed = JSON.parse(scene.getSceneDataJSON());
    } catch {
        return { ok: false, objects: [] };
    }
    if (!Array.isArray(parsed)) return { ok: false, objects: [] };
    const out: ElePotMapObjectEntry[] = [];
    for (let i = 1; i < parsed.length; i++) {
        const obj = parsed[i] as { ID?: number; type?: string; name?: string };
        if (obj?.type !== 'ElePotMap') continue;
        if (typeof obj.ID !== 'number') continue;
        out.push({ objId: obj.ID, name: obj.name ?? '' });
    }
    return { ok: true, objects: out };
}

/**
 * Elepot props whose value is a CueMol colour string and must be compiled
 * through `makeColor` before being assigned. Reflects UXP `onElepotChange`
 * commit branches.
 */
const ELEPOT_COLOR_PROPS = new Set<string>(['lowcol', 'midcol', 'highcol']);

/**
 * Write one Elepot property on a surface renderer.
 *
 * Mirrors UXP `commitElepotPropChange`: open an undo txn, call
 * `rend._wrapped.setProp(propname, val)`. Refuses on non-surface renderers
 * (matches the UXP `rend_type=="molsurf" || "dsurface"` gate).
 */
export function setRendererElepotProp(
    ctx: WorkerContext,
    args: SetRendererElepotPropArgs,
): SetRendererElepotPropResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const rend = resolveColoringTarget(scene, args.targetKind, args.rendId);
    if (!rend) return { ok: false };
    if (!isElepotCapable(rend)) return { ok: false };

    let value: unknown = args.propValue;
    if (
        ELEPOT_COLOR_PROPS.has(args.propName) &&
        typeof args.propValue === 'string'
    ) {
        const ac = makeColor(ctx, args.propValue, scene.uid);
        value = ac.wrapped;
    }

    withUndoTxn(scene, 'Change Elepot coloring', () => {
        // Surface props live directly on the renderer's native wrapper;
        // use the wrapper's setProp escape hatch (mirrors UXP
        // `rend._wrapped.setProp(propname, val)`).
        (rend as unknown as { setProp: (n: string, v: unknown) => void })
            .setProp(args.propName, value);
    });
    return { ok: true };
}
