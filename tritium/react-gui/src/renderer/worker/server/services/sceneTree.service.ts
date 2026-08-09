// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '../types/WorkerContext';
import {
    buildCameraRoot,
    buildStyleRoot,
    parseSceneTreeJSON,
    type CameraRootEntry,
    type SceneNodeType,
    type SceneTreeNode,
    type StyleRootEntry,
} from '../../shared/sceneTreeTypes';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';
import { listGroupChildRenderers } from './helpers/groupChildren';

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

export interface SetNodeUiCollapsedArgs {
    sceneId: number;
    nodeId: number;
    /** Only real C++ nodes persist collapse state (UXP onTwistyClick). */
    nodeType: 'object' | 'rendGroup';
    collapsed: boolean;
}

export interface SetNodeUiCollapsedResult {
    ok: boolean;
}

interface CameraInfoEntry {
    name?: string;
    src?: string;
    vis_size?: number;
}

interface StyleSetJSONEntry {
    name?: string;
    uid?: number;
    scene_id?: number;
    src?: string;
    readonly?: boolean;
    modified?: boolean;
}

function getCameraEntries(scene: Scene): CameraRootEntry[] {
    try {
        const json = scene.getCameraInfoJSON();
        if (!json) return [];
        const parsed = JSON.parse(json) as CameraInfoEntry[];
        if (!Array.isArray(parsed)) return [];
        const out: CameraRootEntry[] = [];
        for (const e of parsed) {
            const name = e.name ?? '';
            if (name.length === 0) continue;
            out.push({
                name,
                src: e.src ?? '',
                visSize: typeof e.vis_size === 'number' ? e.vis_size : 0,
            });
        }
        return out;
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
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, tree: null };
    const json = scene.getSceneDataJSON();
    const tree = parseSceneTreeJSON(json);
    if (!tree) return { ok: false, tree: null };

    // Synthesize camera / style root branches so the tree matches UXP layout.
    // C++ `getSceneDataJSON` does not include cameras or styles; these come
    // from separate APIs.
    const cameraEntries = getCameraEntries(scene);
    const styleEntries = getStyleEntries(ctx, args.sceneId);
    tree.children.push(buildCameraRoot(cameraEntries));
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
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };

    if (args.nodeType === 'rendGroup') {
        // A group's visible flag has no effect on 3D drawing by itself
        // (RendGroup::display() is empty and the C++ scene loop checks
        // each renderer's own flag), so cascade the value to every member
        // renderer inside one txn -- UXP `toggleVisibleRendGrp` parity.
        const grp = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!grp) return { ok: false };
        withUndoTxn(scene, 'Change group visibility', () => {
            grp.visible = args.visible;
            for (const child of listGroupChildRenderers(scene, grp)) {
                child.visible = args.visible;
            }
        });
        return { ok: true };
    }

    const label = args.visible ? 'Show' : 'Hide';
    withUndoTxn(scene, label, () => {
        if (args.nodeType === 'object') {
            const obj = scene.getObject(args.nodeId) as CueMolObject;
            if (!obj) return;
            obj.visible = args.visible;
        } else {
            const rend = scene.getRenderer(args.nodeId) as Renderer;
            if (!rend) return;
            rend.visible = args.visible;
        }
    });
    return { ok: true };
}

/**
 * Persist the tree-row expand/collapse state into the C++ `ui_collapsed`
 * property so it survives a qsc save/load round-trip. UXP parity:
 * `workspace_panel.js` `onTwistyClick` writes the flag directly with NO
 * undo txn (a collapse is not an edit; propChanged skips undo recording
 * outside an active txn). The renderer side filters the resulting
 * `ui_collapsed` PROPCHG event so this write does not trigger a refetch.
 */
function setNodeUiCollapsed(
    ctx: WorkerContext,
    args: SetNodeUiCollapsedArgs,
): SetNodeUiCollapsedResult {
    if (args.nodeType !== 'object' && args.nodeType !== 'rendGroup') {
        return { ok: false };
    }
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };
    const target =
        args.nodeType === 'object'
            ? scene.getObject(args.nodeId)
            : scene.getRenderer(args.nodeId);
    if (!target) return { ok: false };
    (target as unknown as { ui_collapsed: boolean }).ui_collapsed =
        args.collapsed;
    return { ok: true };
}

export const services = {
    getSceneTree,
    setNodeVisible,
    setNodeUiCollapsed,
};
