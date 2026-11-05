/**
 * @file worker/server/services/sceneOps.service.ts
 * @description Worker-thread services for ScenePane toolbar / context-menu
 * operations on the selected scene-tree node(s): focus (zoom-to), delete and
 * rename.
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
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { SceneNodeType } from '@renderer/worker/shared/sceneTreeTypes';
import { withUndoTxn } from '../withUndoTxn';
import { destroyStyleSetIn } from '../style/styleOps';
import { recordDeleteNode, recordOp, recordRenameNode } from '@renderer/worker/server/actions/serviceOps';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { listGroupChildRenderers } from '@renderer/worker/server/services/helpers/groupChildren';
import { collectGroupMemberUids } from '@renderer/worker/server/services/helpers/rendGroup';

export interface FocusOnNodeArgs {
    sceneId: number;
    viewId: number;
    nodeId: number;
    nodeType: SceneNodeType;
    /** False when the caller records the op itself (`focusOnNodes`). */
    record?: boolean;
}

export interface FocusOnNodeResult {
    ok: boolean;
}

export interface FocusOnNodesArgs {
    sceneId: number;
    viewId: number;
    /** Uids of objects, renderers or renderer groups, in any mix. */
    nodeIds: number[];
}

export interface FocusOnNodesResult {
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

export interface RenameNodeArgs {
    sceneId: number;
    nodeId: number;
    nodeType: SceneNodeType;
    newName: string;
}

export interface RenameNodeResult {
    ok: boolean;
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


/**
 * Zoom the view to fit a scene-tree node.
 *
 * Objects use `fitView`; renderers/groups prefer `fitView2` with the
 * renderer's selection, fall back to `fitView`, then to `getCenter` for
 * scalar / density-map renderers. scene / camera / style have no focus
 * action and report `ok: false`.
 */
export function focusOnNode(ctx: WorkerContext, args: FocusOnNodeArgs): FocusOnNodeResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!scene || !view) return { ok: false };
    if (args.record !== false && (args.nodeType === 'object' || args.nodeType === 'renderer' || args.nodeType === 'rendGroup')) {
        recordOp(ctx, scene.uid, 'focus_node', { nodeId: args.nodeId, nodeType: args.nodeType }, ['nodeId']);
    }

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

/** A box in the view's rotated frame, as `getFitBoxJSON` returns it. */
interface FitBox {
    min: [number, number, number];
    max: [number, number, number];
}

/** What fitting several nodes needs of a molecule or a map. */
interface FitBoxSource {
    getFitBoxJSON(view: unknown, sel?: unknown): string;
}

/** What fitting several nodes needs of the view. */
interface FitView {
    fitToBox(vmin: unknown, vmax: unknown): void;
}

/**
 * The fit box of the atoms `sel` matches in a MolCoord (all of them when
 * `sel` is null), or of the whole map for a density map; null when the
 * object has no fit box or nothing matched.
 */
function fitBoxOf(
    ctx: WorkerContext,
    obj: CueMolObject,
    view: GUIView,
    sel: MolSelection | null,
): FitBox | null {
    if (!hasMethod(obj, 'getFitBoxJSON')) return null;
    const src = obj as unknown as FitBoxSource;
    let json: string;
    if (hasMethod(obj, 'fitView2')) {
        // The wrapper cannot pass a null selection, so "all atoms" is spelt out.
        const s = sel ?? makeSel(ctx, '*', obj.scene_uid);
        if (!s) return null;
        json = src.getFitBoxJSON(view, s);
    } else {
        // A map's fit box is always the whole map.
        json = src.getFitBoxJSON(view);
    }
    return json ? (JSON.parse(json) as FitBox) : null;
}

/** The fit box of one scene-tree node, as `focusOnNode` would frame it. */
function nodeFitBox(ctx: WorkerContext, scene: Scene, view: GUIView, nodeId: number, nodeType: SceneNodeType): FitBox | null {
    if (nodeType === 'object') {
        const obj = scene.getObject(nodeId) as CueMolObject | null;
        return obj ? fitBoxOf(ctx, obj, view, null) : null;
    }
    if (nodeType === 'renderer' || nodeType === 'rendGroup') {
        const rend = scene.getRenderer(nodeId) as Renderer | null;
        const client = rend?.getClientObj() as CueMolObject | null | undefined;
        if (!rend || !client) return null;
        const sel = hasProp(rend, 'sel') ? ((rend as unknown as { sel: MolSelection }).sel ?? null) : null;
        return fitBoxOf(ctx, client, view, sel);
    }
    return null;
}

/**
 * What a uid names in the scene, for the fit: an object, or a renderer (a
 * group frames as a renderer does); null when it names neither.
 */
function fitNodeType(scene: Scene, id: number): 'object' | 'renderer' | null {
    if (safeRead(() => scene.getObject(id))) return 'object';
    if (safeRead(() => scene.getRenderer(id))) return 'renderer';
    return null;
}

/**
 * Zoom the view to fit several objects / renderers at once (the `focus_nodes`
 * op, and the scene-tree Focus button on a multi-selection).
 *
 * Each node contributes the box its own focus would frame (a molecule's
 * atoms, or a renderer's selection, grown by 20%; a map's whole cell), all
 * measured in the view's current axes; the view is fitted to their union by
 * `View.fitToBox`, keeping the direction it looks. One node takes the
 * single-node path (`focusOnNode`), so it frames exactly as before. Uids that
 * name no object or renderer, and nodes with no box, are skipped.
 */
export function focusOnNodes(ctx: WorkerContext, args: FocusOnNodesArgs): FocusOnNodesResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    const view = ctx.sceMgr.getView(args.viewId) as GUIView;
    if (!scene || !view) return { ok: false };
    const nodes = args.nodeIds.flatMap((id) => {
        const t = fitNodeType(scene, id);
        return t ? [{ id, type: t }] : [];
    });
    if (nodes.length === 0) return { ok: false };
    recordOp(ctx, scene.uid, 'focus_nodes', { nodeIds: nodes.map((n) => n.id) }, ['nodeIds']);

    if (nodes.length === 1) {
        const [n] = nodes;
        return focusOnNode(ctx, { sceneId: args.sceneId, viewId: args.viewId, nodeId: n.id, nodeType: n.type, record: false });
    }

    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const n of nodes) {
        const box = nodeFitBox(ctx, scene, view, n.id, n.type);
        if (!box) continue;
        for (let i = 0; i < 3; i++) {
            lo[i] = Math.min(lo[i], box.min[i]);
            hi[i] = Math.max(hi[i], box.max[i]);
        }
    }
    if (!Number.isFinite(lo[0])) return { ok: false };

    const toVec = (v: number[]) => {
        const vec = ctx.svc.createObj('Vector') as unknown as { x: number; y: number; z: number };
        vec.x = v[0];
        vec.y = v[1];
        vec.z = v[2];
        return vec;
    };
    (view as unknown as FitView).fitToBox(toVec(lo), toVec(hi));
    return { ok: true };
}

/**
 * Delete a scene-tree node within an undo transaction.
 *
 * Supports object / renderer / rendGroup / style nodes; a rendGroup also
 * destroys its child renderers (`childIds`). scene / camera are not
 * supported and report `ok: false`.
 */
export function deleteNode(ctx: WorkerContext, args: DeleteNodeArgs): DeleteNodeResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false };

    if (args.nodeType === 'object') {
        const obj = scene.getObject(args.nodeId) as CueMolObject | null;
        if (!obj) return { ok: false };
        const name = safeRead(() => obj.name) ?? '';
        withUndoTxn(scene, `Destroy object ${name}`, () => {
            recordDeleteNode(ctx, scene.uid, 'object', args.nodeId);
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
            recordDeleteNode(ctx, scene.uid, 'renderer', args.nodeId);
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
        return destroyStyleSetIn(ctx, scene, mgr, args.scopeId, args.nodeId);
    }

    if (args.nodeType === 'rendGroup') {
        const grp = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!grp) return { ok: false };
        const client = grp.getClientObj() as CueMolObject | null;
        if (!client) return { ok: false };
        const objName = safeRead(() => client.name) ?? '';
        const grpName = safeRead(() => grp.name) ?? '';
        withUndoTxn(scene, `Delete rend group: ${objName}/${grpName}`, () => {
            recordDeleteNode(ctx, scene.uid, 'rendGroup', args.nodeId);
            // Union the caller's snapshot with the live membership: a renderer
            // moved into the group after the tree was fetched would otherwise
            // survive with `group` still naming the destroyed group, which
            // hides it from the scene tree for good.
            for (const cid of collectGroupMemberUids(scene, grp, args.childIds)) {
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

    // scene / camera / style nodes are not supported here.
    return { ok: false };
}

/**
 * Rename a scene-tree node within an undo transaction.
 *
 * object / renderer / rendGroup assign `name` directly; scene uses
 * `setName` (its `name` is read-only at the .qif level). camera rename
 * goes through `cameraOps.renameCamera`; style has no rename - both are
 * rejected here. An empty / whitespace-only name is rejected.
 */
export function renameNode(ctx: WorkerContext, args: RenameNodeArgs): RenameNodeResult {
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
            recordRenameNode(ctx, scene.uid, 'scene', args.nodeId, trimmed);
            (scene as unknown as { setName: (n: string) => void }).setName(trimmed);
        });
        return { ok: true };
    }

    if (args.nodeType === 'rendGroup') {
        // Group membership is a name reference (each member renderer's
        // `group` string must equal the group's name), so renaming the
        // group must re-assign every member's `group` in the same txn --
        // UXP `onRenameRendGrp` parity. Additionally reject a name that
        // collides with any other renderer in the scene: group names are
        // the membership key, and `createRendererGroup` enforces the same
        // scene-wide uniqueness via getRendByName.
        const grp = scene.getRenderer(args.nodeId) as Renderer | null;
        if (!grp) return { ok: false };
        const dup = safeRead(() => scene.getRendByName(trimmed) as Renderer | null);
        if (dup && safeRead(() => dup.uid) !== args.nodeId) return { ok: false };
        // Collect members by the OLD name before the rename happens.
        const children = listGroupChildRenderers(scene, grp);
        withUndoTxn(scene, `Change rend group name: ${trimmed}`, () => {
            recordRenameNode(ctx, scene.uid, 'rendGroup', args.nodeId, trimmed);
            grp.name = trimmed;
            for (const c of children) {
                try { c.group = trimmed; } catch { /* ignore */ }
            }
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
        recordRenameNode(ctx, scene.uid, args.nodeType, args.nodeId, trimmed);
        target!.name = trimmed;
    });
    return { ok: true };
}
