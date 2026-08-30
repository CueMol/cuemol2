// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// camera "Edit visibility flags" (UXP `tools/visflagset-edit-dlg`).
//
// A camera optionally captures a per-object / per-renderer visibility set
// (saved via `saveVisSettings`, applied via `loadVisSettings`). This service
// backs the editor dialog that lets the user pick, per scene element, whether
// the camera captures it (`include`) and the stored visibility (`visible`).
//
// Cameras are keyed by name at the Scene API level (see cameraOps.service).
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Camera } from '@cuemol/core/src/wrappers/Camera';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { parseSceneTreeJSON, type SceneTreeNode } from '@renderer/worker/shared/sceneTreeTypes';

/** One scene element (object / renderer) row in the vis-flags editor. */
export interface VisFlagEntry {
    /** C++ uid of the object or renderer. */
    tgtId: number;
    /** Display name. */
    tgtName: string;
    /** true for an Object, false for a renderer / renderer group. */
    isObj: boolean;
    /** Whether the camera captures this element's visibility. */
    included: boolean;
    /** Captured (or current, when not included) visibility state. */
    visible: boolean;
}

export interface GetCameraVisFlagsArgs {
    sceneId: number;
    cameraName: string;
}

export interface GetCameraVisFlagsResult {
    ok: boolean;
    entries: VisFlagEntry[];
}

export interface SetCameraVisFlagsArgs {
    sceneId: number;
    cameraName: string;
    entries: VisFlagEntry[];
}

export interface SetCameraVisFlagsResult {
    ok: boolean;
}

/** One record of the camera's stored vis set (`getVisSetJSON` value shape). */
interface VisSetRecord {
    visible?: boolean;
}

function getCameraRef(scene: Scene, name: string): Camera | null {
    try {
        return (scene.getCameraRef(name) as Camera | null) ?? null;
    } catch {
        return null;
    }
}

interface VisTarget {
    id: number;
    name: string;
    isObj: boolean;
    visible: boolean;
}

/** Collect every object / renderer / renderer-group node (the vis targets). */
function collectVisTargets(node: SceneTreeNode, out: VisTarget[]): void {
    if (node.type === 'object' || node.type === 'renderer' || node.type === 'rendGroup') {
        out.push({
            id: node.id,
            name: node.name,
            isObj: node.type === 'object',
            visible: node.visible,
        });
    }
    for (const child of node.children ?? []) collectVisTargets(child, out);
}

export function getCameraVisFlags(
    ctx: WorkerContext,
    args: GetCameraVisFlagsArgs,
): GetCameraVisFlagsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, entries: [] };
    const cam = getCameraRef(scene, args.cameraName);
    if (!cam) return { ok: false, entries: [] };

    // Stored set: { "<uid>": { uid, type, include, visible }, ... } ({} when empty).
    let stored: Record<string, VisSetRecord> = {};
    try {
        const json = cam.getVisSetJSON();
        if (json) stored = JSON.parse(json) as Record<string, VisSetRecord>;
    } catch {
        stored = {};
    }

    const tree = parseSceneTreeJSON(scene.getSceneDataJSON());
    const targets: VisTarget[] = [];
    if (tree) collectVisTargets(tree, targets);

    const entries: VisFlagEntry[] = targets.map((t) => {
        const rec = stored[String(t.id)];
        const included = rec !== undefined;
        return {
            tgtId: t.id,
            tgtName: t.name,
            isObj: t.isObj,
            included,
            // Captured visibility when included; the live flag otherwise.
            visible: included && typeof rec.visible === 'boolean' ? rec.visible : t.visible,
        };
    });
    return { ok: true, entries };
}

export function setCameraVisFlags(
    ctx: WorkerContext,
    args: SetCameraVisFlagsArgs,
): SetCameraVisFlagsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const cam = getCameraRef(scene, args.cameraName);
    if (!cam) return { ok: false };

    // Rebuild the set from the dialog state: clear, then append the included
    // rows. The dialog lists every scene element, so a clear+rebuild yields
    // exactly the desired set (and drops stale uids for deleted elements).
    withUndoTxn(scene, `Edit visibility flags in ${args.cameraName}`, () => {
        cam.clearVisSettings();
        for (const e of args.entries) {
            if (e.included) cam.visAppend(e.tgtId, e.visible, e.isObj);
        }
    });
    return { ok: true };
}
