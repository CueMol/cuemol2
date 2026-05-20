/**
 * @file worker/server/services/sceneOps.service.ts
 * @description Worker-thread services for ScenePane toolbar / context-menu
 * operations on the selected scene-tree node: focus (zoom-to), delete and
 * rename, plus a legacy property-info fetch.
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
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
    /**
     * Style scope id (0 for global, scene.uid for scene-local). Required
     * when nodeType === 'style' so the worker can call
     * `StyleManager.destroyStyleSet(scopeId, styleSetId)` with the right
     * scope. Ignored for other node types.
     */
    scopeId?: number;
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

// --- helpers ---

/** Whether `obj` has a callable method named `name`. */
function hasMethod<T>(obj: T, name: string): boolean {
    return obj != null && typeof (obj as unknown as Record<string, unknown>)[name] === 'function';
}

/** Whether `obj` has an own/inherited property named `name`. */
function hasProp<T>(obj: T, name: string): boolean {
    return obj != null && name in (obj as unknown as Record<string, unknown>);
}

/** Run a getter, returning `undefined` if it throws. */
function safeRead<T>(read: () => T): T | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}

/**
 * Zoom the view to fit a scene-tree node.
 *
 * Objects use `fitView`; renderers/groups prefer `fitView2` with the
 * renderer's selection, fall back to `fitView`, then to `getCenter` for
 * scalar / density-map renderers. scene / camera / style have no focus
 * action and report `ok: false`.
 */
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

/**
 * Delete a scene-tree node within an undo transaction.
 *
 * Supports object / renderer / rendGroup / style nodes; a rendGroup also
 * destroys its child renderers (`childIds`). scene / camera are not
 * supported and report `ok: false`.
 */
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

    if (args.nodeType === 'style') {
        if (args.scopeId === undefined) return { ok: false };
        const mgr = ctx.svc.getService('StyleManager') as unknown as
            | { destroyStyleSet: (scopeId: number, styleSetId: number) => boolean }
            | null;
        if (!mgr) return { ok: false };
        let ok = false;
        withUndoTxn(scene, 'Destroy style', () => {
            ok = mgr.destroyStyleSet(args.scopeId!, args.nodeId);
        });
        return { ok };
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

/** Stringify `raw` and append it as a `{ key, value }` entry; skips null/undefined. */
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

/** Collect the common uid / name / visible / locked properties of a node. */
function collectCommonProps(target: unknown): NodeInfoEntry[] {
    const out: NodeInfoEntry[] = [];
    const t = target as Record<string, unknown>;
    pushEntry(out, 'uid', safeRead(() => t.uid));
    pushEntry(out, 'name', safeRead(() => t.name));
    pushEntry(out, 'visible', safeRead(() => t.visible));
    pushEntry(out, 'locked', safeRead(() => t.locked));
    return out;
}

/**
 * Collect a flat list of human-readable property entries for a node, used
 * by the read-only property dialog.
 *
 * Deprecated: superseded by the `getGenericProps` service
 * (genericProps.service.ts) backing the generic property inspector. Kept
 * compiling pending removal of the retired `NodePropertyDialog` modal;
 * scheduled for deletion together with its ServiceMap row.
 */
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

    if (args.nodeType === 'style') {
        const mgr = ctx.svc.getService('StyleManager') as unknown as
            | { getStyleSet: (id: number) => unknown }
            | null;
        const set = mgr?.getStyleSet(args.nodeId) as unknown as Record<string, unknown> | null;
        if (!set) return empty;
        const entries: NodeInfoEntry[] = [];
        pushEntry(entries, 'name', safeRead(() => set.name));
        pushEntry(entries, 'src', safeRead(() => set.src));
        pushEntry(entries, 'readonly', safeRead(() => set.readonly));
        pushEntry(entries, 'modified', safeRead(() => set.modified));
        const displayName = (safeRead(() => set.name) as string | undefined) || 'Style';
        return { ok: true, entries, displayName };
    }

    // camera not supported in Phase 2 (Phase 5b).
    return empty;
}

/**
 * Rename a scene-tree node within an undo transaction.
 *
 * object / renderer / rendGroup assign `name` directly; scene uses
 * `setName` (its `name` is read-only at the .qif level). camera rename
 * goes through `cameraOps.renameCamera`; style has no rename - both are
 * rejected here. An empty / whitespace-only name is rejected.
 */
function renameNode(ctx: WorkerContext, args: RenameNodeArgs): RenameNodeResult {
    if (
        args.nodeType !== 'object' &&
        args.nodeType !== 'renderer' &&
        args.nodeType !== 'rendGroup' &&
        args.nodeType !== 'scene'
    ) {
        return { ok: false };
    }
    const trimmed = args.newName.trim();
    if (trimmed.length === 0) return { ok: false };

    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false };

    if (args.nodeType === 'scene') {
        // The scene tree exposes the scene as a leaf node with id =
        // scene.uid; we always rename the active scene rather than
        // resolving via `getObject` etc. The setName method is on
        // Scene itself.
        withUndoTxn(scene, `Rename to ${trimmed}`, () => {
            (scene as unknown as { setName: (n: string) => void }).setName(trimmed);
        });
        return { ok: true };
    }

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
