// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '../types/WorkerContext';
import {
    buildCameraRoot,
    buildStyleRoot,
    parseSceneTreeJSON,
    type SceneNodeType,
    type SceneTreeNode,
    type StyleRootEntry,
} from '../../shared/sceneTreeTypes';
import { withUndoTxn } from './withUndoTxn';

export interface GetSceneTreeArgs {
    sceneId: number;
}

export interface GetSceneTreeResult {
    ok: boolean;
    tree: SceneTreeNode | null;
}

export interface SetNodeVisibleArgs {
    sceneId: number;
    nodeId: number;
    nodeType: SceneNodeType;
    visible: boolean;
}

export interface SetNodeVisibleResult {
    ok: boolean;
}

interface CameraInfoEntry {
    name?: string;
}

interface StyleSetJSONEntry {
    name?: string;
    uid?: number;
    scene_id?: number;
    src?: string;
    readonly?: boolean;
    modified?: boolean;
}

function getCameraNames(scene: Scene): string[] {
    try {
        const json = scene.getCameraInfoJSON();
        if (!json) return [];
        const parsed = JSON.parse(json) as CameraInfoEntry[];
        if (!Array.isArray(parsed)) return [];
        return parsed.map((e) => e.name ?? '').filter((n) => n.length > 0);
    } catch {
        return [];
    }
}

function parseStyleSetsJSON(
    styleMgr: { getStyleSetsJSON: (id: number) => string },
    scopeId: number,
): StyleRootEntry[] {
    try {
        const json = styleMgr.getStyleSetsJSON(scopeId);
        if (!json) return [];
        const parsed = JSON.parse(json) as StyleSetJSONEntry[];
        if (!Array.isArray(parsed)) return [];
        const out: StyleRootEntry[] = [];
        for (const e of parsed) {
            if (typeof e.uid !== 'number') continue;
            out.push({
                name: e.name ?? '',
                uid: e.uid,
                scopeId: e.scene_id ?? scopeId,
                src: e.src ?? '',
                readonly: e.readonly === true,
                modified: e.modified === true,
            });
        }
        return out;
    } catch {
        return [];
    }
}

function getStyleEntries(ctx: WorkerContext, sceneId: number): StyleRootEntry[] {
    // UXP `createStyleNodeData` concatenates `getStyleSetsJSON(0)` (global)
    // with `getStyleSetsJSON(scene.uid)` (scene-local). Mirror that layout.
    const styleMgr = ctx.svc.getService('StyleManager') as unknown as
        | { getStyleSetsJSON?: (id: number) => string }
        | null;
    if (!styleMgr?.getStyleSetsJSON) return [];
    const mgr = styleMgr as { getStyleSetsJSON: (id: number) => string };
    return [...parseStyleSetsJSON(mgr, 0), ...parseStyleSetsJSON(mgr, sceneId)];
}

function getSceneTree(ctx: WorkerContext, args: GetSceneTreeArgs): GetSceneTreeResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false, tree: null };
    const json = scene.getSceneDataJSON();
    const tree = parseSceneTreeJSON(json);
    if (!tree) return { ok: false, tree: null };

    // Synthesize camera / style root branches so the tree matches UXP layout.
    // C++ `getSceneDataJSON` does not include cameras or styles; these come
    // from separate APIs.
    const cameraNames = getCameraNames(scene);
    const styleEntries = getStyleEntries(ctx, args.sceneId);
    tree.children.push(buildCameraRoot(cameraNames));
    tree.children.push(buildStyleRoot(styleEntries));

    return { ok: true, tree };
}

function setNodeVisible(
    ctx: WorkerContext,
    args: SetNodeVisibleArgs,
): SetNodeVisibleResult {
    // Only object / renderer / rendGroup carry a real visibility flag.
    if (
        args.nodeType !== 'object' &&
        args.nodeType !== 'renderer' &&
        args.nodeType !== 'rendGroup'
    ) {
        return { ok: false };
    }
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false };

    const label = args.visible ? 'Show' : 'Hide';
    withUndoTxn(scene, label, () => {
        if (args.nodeType === 'object') {
            const obj = scene.getObject(args.nodeId) as CueMolObject;
            if (!obj) return;
            obj.visible = args.visible;
        } else {
            // 'renderer' and 'rendGroup' both lookup via getRenderer.
            const rend = scene.getRenderer(args.nodeId) as Renderer;
            if (!rend) return;
            rend.visible = args.visible;
        }
    });
    return { ok: true };
}

export const services = {
    getSceneTree,
    setNodeVisible,
};
