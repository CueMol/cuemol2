// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase 4c: panel.workspace.ctxmenu.multi — bulk Show / Hide / Delete
// for multi-selected tree nodes. Mirrors UXP `onShowHideCmd` and the
// per-element loop in `onDeleteCmd` (multi branch).
//
// The whole batch lives inside ONE undo transaction so the user can
// undo a multi-delete or multi-visibility-toggle with a single Cmd+Z.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '../types/WorkerContext';
import type { SceneNodeType } from '../../shared/sceneTreeTypes';
import { withUndoTxn } from './withUndoTxn';

export interface BulkSceneNodeItem {
    nodeId: number;
    nodeType: SceneNodeType;
    /** Required for rendGroup items so the bulk-delete tears down children. */
    childIds?: number[];
}

export interface BulkSetVisibleArgs {
    sceneId: number;
    items: BulkSceneNodeItem[];
    visible: boolean;
}

export interface BulkDeleteArgs {
    sceneId: number;
    items: BulkSceneNodeItem[];
}

export interface BulkOpResult {
    ok: boolean;
    /** Number of items the service actually applied. */
    applied: number;
}

function isOperable(t: SceneNodeType): boolean {
    return t === 'object' || t === 'renderer' || t === 'rendGroup';
}

function bulkSetNodeVisible(
    ctx: WorkerContext,
    args: BulkSetVisibleArgs,
): BulkOpResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { ok: false, applied: 0 };
    const items = args.items.filter((it) => isOperable(it.nodeType));
    if (items.length === 0) return { ok: false, applied: 0 };

    let applied = 0;
    const label = args.visible ? 'Show multiple' : 'Hide multiple';
    withUndoTxn(scene, label, () => {
        for (const it of items) {
            if (it.nodeType === 'object') {
                const obj = scene.getObject(it.nodeId) as CueMolObject | null;
                if (!obj) continue;
                if (obj.visible !== args.visible) {
                    obj.visible = args.visible;
                }
                applied += 1;
            } else {
                const rend = scene.getRenderer(it.nodeId) as Renderer | null;
                if (!rend) continue;
                if (rend.visible !== args.visible) {
                    rend.visible = args.visible;
                }
                applied += 1;
            }
        }
    });
    return { ok: applied > 0, applied };
}

function bulkDeleteNode(
    ctx: WorkerContext,
    args: BulkDeleteArgs,
): BulkOpResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene | null;
    if (!scene) return { ok: false, applied: 0 };
    const items = args.items.filter((it) => isOperable(it.nodeType));
    if (items.length === 0) return { ok: false, applied: 0 };

    let applied = 0;
    withUndoTxn(scene, 'Delete multiple', () => {
        for (const it of items) {
            if (it.nodeType === 'object') {
                const obj = scene.getObject(it.nodeId) as CueMolObject | null;
                if (!obj) continue;
                try { scene.destroyObject(it.nodeId); applied += 1; }
                catch (e) { console.warn('destroyObject failed:', e); }
            } else if (it.nodeType === 'renderer') {
                const rend = scene.getRenderer(it.nodeId) as Renderer | null;
                if (!rend) continue;
                const client = rend.getClientObj() as CueMolObject | null;
                if (!client) continue;
                try { client.destroyRenderer(it.nodeId); applied += 1; }
                catch (e) { console.warn('destroyRenderer failed:', e); }
            } else {
                // rendGroup: destroy its child renderers (caller-supplied)
                // then the group itself. Matches the existing deleteNode
                // service's rendGroup branch.
                const grp = scene.getRenderer(it.nodeId) as Renderer | null;
                if (!grp) continue;
                const client = grp.getClientObj() as CueMolObject | null;
                if (!client) continue;
                for (const cid of it.childIds ?? []) {
                    try { client.destroyRenderer(cid); }
                    catch (e) { console.warn('destroyRenderer (group child) failed:', e); }
                }
                try { client.destroyRenderer(it.nodeId); applied += 1; }
                catch (e) { console.warn('destroyRenderer (group) failed:', e); }
            }
        }
    });
    return { ok: applied > 0, applied };
}

export const services = {
    bulkSetNodeVisible,
    bulkDeleteNode,
};
