// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Phase 2 of the panel.workspace migration: toolbar operations that act on
// the currently selected scene-tree node — focus (zoom), delete, and
// property-info fetch (drives a JSON-dump stub dialog).
//
// Behaviour mirrors the UXP equivalents:
//   - focusOnNode       → workspace_panel.js  onBtnZoomCmd
//   - deleteNode        → workspace_panel.js  onDeleteCmd / deleteCmdImpl
//   - getNodeInfo       → workspace_panel.js  onPropCmd (stub; real per-type
//                         property editor lands in Phase 5)
//
// scene / camera / style nodes are out of Phase 2 scope and report ok:false.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { GUIView } from '@cuemol/core/src/wrappers/GUIView';
import type { MolSelection } from '@cuemol/core/src/wrappers/MolSelection';
import type { Vector } from '@cuemol/core/src/wrappers/Vector';
import type { WorkerContext } from '../types/WorkerContext';
import type { SceneNodeType } from '../../shared/sceneTreeTypes';
import { withUndoTxn } from './withUndoTxn';

export interface FocusOnNodeArgs {
    sceneId: number;
    viewId: number;
    nodeId: number;
    nodeType: SceneNodeType;
}

export interface FocusOnNodeResult {
    ok: boolean;
}

export interface DeleteNodeArgs {
    sceneId: number;
    nodeId: number;
    nodeType: SceneNodeType;
    /** Child renderer IDs, required when nodeType === 'rendGroup'. */
    childIds?: number[];
}

export interface DeleteNodeResult {
    ok: boolean;
}

export interface GetNodeInfoArgs {
    sceneId: number;
    nodeId: number;
    nodeType: SceneNodeType;
}

export interface RenameNodeArgs {
    sceneId: number;
    nodeId: number;
    nodeType: SceneNodeType;
    newName: string;
}

export interface RenameNodeResult {
    ok: boolean;
}

export interface NodeInfoEntry {
    key: string;
    value: string;
}

export interface GetNodeInfoResult {
    ok: boolean;
    /** Human-readable property entries; empty if lookup fails. */
    entries: NodeInfoEntry[];
    /** Display name used as dialog title. */
    displayName: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────

function hasMethod<T>(obj: T, name: string): boolean {
    return obj != null && typeof (obj as unknown as Record<string, unknown>)[name] === 'function';
}

function hasProp<T>(obj: T, name: string): boolean {
    return obj != null && name in (obj as unknown as Record<string, unknown>);
}

function safeRead<T>(read: () => T): T | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}

// ─── focusOnNode ──────────────────────────────────────────────────────────

function focusOnNode(ctx: WorkerContext, args: FocusOnNodeArgs): FocusOnNodeResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!scene || !view) return { ok: false };

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return { ok: false };
        if (hasMethod(obj, 'fitView')) {
            (obj as unknown as MolCoord).fitView(view, false);
            return { ok: true };
        }
        return { ok: false };
    }

    if (args.nodeType === 'renderer' || args.nodeType === 'rendGroup') {
        const rend = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!rend) return { ok: false };
        const client = rend.getClientObj() as CueMolObject | null;
        if (!client) return { ok: false };
        // Prefer fitView2 with the renderer's selection when both exist
        // (matches UXP onBtnZoomCmd).
        if (hasProp(rend, 'sel') && hasMethod(client, 'fitView2')) {
            const sel = (rend as unknown as { sel: MolSelection }).sel;
            if (sel) {
                (client as unknown as MolCoord).fitView2(view, sel);
                return { ok: true };
            }
        }
        if (hasMethod(client, 'fitView')) {
            (client as unknown as MolCoord).fitView(view, false);
            return { ok: true };
        }
        // Scalar object / density map renderers: use renderer.getCenter.
        const hasCenter = safeRead(
            () => (rend as unknown as { has_center: boolean }).has_center,
        );
        if (hasCenter && hasMethod(rend, 'getCenter')) {
            const pos = (rend as unknown as { getCenter: () => Vector }).getCenter();
            view.setViewCenter(pos);
            return { ok: true };
        }
    }

    // scene / camera / style: no focus action.
    return { ok: false };
}

// ─── deleteNode ───────────────────────────────────────────────────────────

function deleteNode(ctx: WorkerContext, args: DeleteNodeArgs): DeleteNodeResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false };

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return { ok: false };
        const name = safeRead(() => obj.name) ?? '';
        withUndoTxn(scene, `Destroy object ${name}`, () => {
            scene.destroyObject(args.nodeId);
        });
        return { ok: true };
    }

    if (args.nodeType === 'renderer') {
        const rend = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!rend) return { ok: false };
        const client = rend.getClientObj() as CueMolObject | null;
        if (!client) return { ok: false };
        const objName = safeRead(() => client.name) ?? '';
        const rendName = safeRead(() => rend.name) ?? '';
        withUndoTxn(scene, `Delete renderer: ${objName}/${rendName}`, () => {
            client.destroyRenderer(args.nodeId);
        });
        return { ok: true };
    }

    if (args.nodeType === 'rendGroup') {
        const grp = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!grp) return { ok: false };
        const client = grp.getClientObj() as CueMolObject | null;
        if (!client) return { ok: false };
        const objName = safeRead(() => client.name) ?? '';
        const grpName = safeRead(() => grp.name) ?? '';
        const childIds = args.childIds ?? [];
        withUndoTxn(scene, `Delete rend group: ${objName}/${grpName}`, () => {
            for (const cid of childIds) {
                try {
                    client.destroyRenderer(cid);
                } catch (e) {
                    console.warn('destroyRenderer (group child) failed:', e);
                }
            }
            client.destroyRenderer(args.nodeId);
        });
        return { ok: true };
    }

    // scene / camera / style not supported in Phase 2.
    return { ok: false };
}

// ─── getNodeInfo ──────────────────────────────────────────────────────────

function pushEntry(entries: NodeInfoEntry[], key: string, raw: unknown): void {
    if (raw === undefined || raw === null) return;
    let value: string;
    if (typeof raw === 'string') value = raw;
    else if (typeof raw === 'number' || typeof raw === 'boolean') value = String(raw);
    else {
        try {
            value = JSON.stringify(raw);
        } catch {
            value = String(raw);
        }
    }
    entries.push({ key, value });
}

function collectCommonProps(target: unknown): NodeInfoEntry[] {
    const out: NodeInfoEntry[] = [];
    const t = target as Record<string, unknown>;
    pushEntry(out, 'uid', safeRead(() => t.uid));
    pushEntry(out, 'name', safeRead(() => t.name));
    pushEntry(out, 'visible', safeRead(() => t.visible));
    pushEntry(out, 'locked', safeRead(() => t.locked));
    return out;
}

function getNodeInfo(ctx: WorkerContext, args: GetNodeInfoArgs): GetNodeInfoResult {
    const empty: GetNodeInfoResult = { ok: false, entries: [], displayName: '' };
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return empty;

    if (args.nodeType === 'scene') {
        const entries = collectCommonProps(scene);
        return { ok: true, entries, displayName: safeRead(() => scene.name) ?? 'Scene' };
    }

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return empty;
        const entries = collectCommonProps(obj);
        pushEntry(entries, 'className', safeRead(() => (obj as unknown as { className: string }).className));
        return { ok: true, entries, displayName: safeRead(() => obj.name) ?? 'Object' };
    }

    if (args.nodeType === 'renderer' || args.nodeType === 'rendGroup') {
        const rend = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!rend) return empty;
        const entries = collectCommonProps(rend);
        pushEntry(entries, 'type', safeRead(() => (rend as unknown as { type_name: string }).type_name));
        pushEntry(entries, 'group', safeRead(() => (rend as unknown as { group: string }).group));
        return { ok: true, entries, displayName: safeRead(() => rend.name) ?? 'Renderer' };
    }

    // camera / style not supported in Phase 2 (Phase 5).
    return empty;
}

// ─── renameNode ───────────────────────────────────────────────────────────

function renameNode(ctx: WorkerContext, args: RenameNodeArgs): RenameNodeResult {
    // Only object / renderer / rendGroup support direct name assignment in
    // Phase 3a. Camera and style rename require the atomic destroy + setCamera
    // / re-register pattern; those land in Phase 5.
    if (
        args.nodeType !== 'object' &&
        args.nodeType !== 'renderer' &&
        args.nodeType !== 'rendGroup'
    ) {
        return { ok: false };
    }
    const trimmed = args.newName.trim();
    if (trimmed.length === 0) return { ok: false };

    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false };

    let target: { name: string } | null = null;
    if (args.nodeType === 'object') {
        target = scene.getObject(args.nodeId) as unknown as { name: string } | null;
    } else {
        target = scene.getRenderer(args.nodeId) as unknown as { name: string } | null;
    }
    if (!target) return { ok: false };

    withUndoTxn(scene, `Rename to ${trimmed}`, () => {
        target!.name = trimmed;
    });
    return { ok: true };
}

export const services = {
    focusOnNode,
    deleteNode,
    getNodeInfo,
    renameNode,
};
