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

interface StyleNameEntry {
    name?: string;
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

function getStyleNames(ctx: WorkerContext, sceneId: number): string[] {
    try {
        // Phase 1 placeholder: returning empty is fine — Camera/Styles root
        // are shown to match UXP layout; populating them lands in Phase 5.
        const styleMgr = ctx.svc.getService('StyleManager') as unknown as
            | { getStyleNamesJSON?: (id: number) => string }
            | null;
        if (!styleMgr?.getStyleNamesJSON) return [];
        const json = styleMgr.getStyleNamesJSON(sceneId);
        if (!json) return [];
        const parsed = JSON.parse(json) as StyleNameEntry[];
        if (!Array.isArray(parsed)) return [];
        return parsed.map((e) => e.name ?? '').filter((n) => n.length > 0);
    } catch {
        return [];
    }
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
    const styleNames = getStyleNames(ctx, args.sceneId);
    tree.children.push(buildCameraRoot(cameraNames));
    tree.children.push(buildStyleRoot(styleNames));

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
