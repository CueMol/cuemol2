// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// panel.workspace.tree -- drag-drop reorder. Mirrors UXP
// `workspace_panel_dnd.js` `moveObjTo` / `moveRendTo` / `_moveToImpl`.
//
// Reorder semantics: ui_order is a unique-per-parent integer property.
// UXP performs a bubble-sort swap of ui_order values down the range
// between the source's slot and the target's slot -- only the affected
// siblings get touched, and ui_order values remain dense. This file
// ports that algorithm verbatim so the post-drag tree matches UXP.
//
// For renderer DnD that crosses an obj's group boundary, rend.group
// is assigned (or cleared) before the ui_order swap; UXP `moveRendTo`
// does the same.

import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { enumerateObjectRenderers } from '@renderer/worker/server/services/helpers/groupChildren';
import { isRendGroup } from '@renderer/worker/server/services/helpers/rendGroup';
import { recordOp, recordPropWrite } from '@renderer/worker/server/actions/serviceOps';
import type { MoveDest } from '@renderer/worker/server/catalog/moveDest';
import { moveTarget } from '@renderer/worker/server/catalog/moveDest';

/** -1 = drop BEFORE target; 0 = drop AT target (used for rendGroup INTO); +1 = drop AFTER. */
export type ReorderOri = -1 | 0 | 1;

export type ReorderSceneNodeArgs =
    | {
        kind: 'object';
        sceneId: number;
        sourceId: number;
        targetId: number;
        ori: -1 | 1;
    }
    | {
        kind: 'renderer';
        sceneId: number;
        /** uid of the renderer or rendGroup being moved. */
        sourceId: number;
        /** uid of the destination obj (parent the moved rend ends up under). */
        destObjId: number;
        /** Empty string for root branch; group name to assign to rend.group. */
        destGroupName: string;
        /**
         * Sibling we drop near (a renderer or rendGroup uid under destObjId).
         * For "drop INTO an empty rendGroup", caller passes the group uid
         * itself with ori=0; the worker recognises the same uid as source
         * and skips the slot swap.
         */
        targetId: number;
        ori: ReorderOri;
    };

export interface ReorderSceneNodeResult {
    ok: boolean;
}

interface OrderedItem {
    uid: number;
    get ui_order(): number;
    set ui_order(v: number);
}

/**
 * Port of UXP `_moveToImpl`. Bubble-swap ui_order along the
 * source->target slot range. `items` MUST contain both `src` and `dst`
 * and be ordered by current ui_order ascending.
 */
function bubbleSwapOrder(
    items: OrderedItem[],
    src: OrderedItem,
    dst: OrderedItem,
    ori: ReorderOri,
): void {
    const ord_1 = src.ui_order;
    let ord_2 = dst.ui_order;

    // ori adjustment: shift the target slot up/down one row to reflect
    // "before / after" intent at edges.
    if (ori !== 0) {
        const irow2 = items.findIndex((it) => it.uid === dst.uid);
        if (irow2 === -1) return;
        if (ord_1 < ord_2 && ori === -1) {
            if (irow2 - 1 < 0) return;
            dst = items[irow2 - 1];
            ord_2 = dst.ui_order;
        } else if (ord_1 > ord_2 && ori === 1) {
            if (irow2 + 1 >= items.length) return;
            dst = items[irow2 + 1];
            ord_2 = dst.ui_order;
        }
    }

    if (ord_1 === ord_2) return;  // no movement

    if (ord_1 < ord_2) {
        // Move down: bubble swap downward.
        let i = items.length - 1;
        for (; i >= 0; --i) {
            if (items[i].ui_order === ord_2) break;
        }
        for (; i >= 1; --i) {
            const a = items[i - 1];
            const b = items[i];
            const o = a.ui_order;
            a.ui_order = b.ui_order;
            b.ui_order = o;
            if (o === ord_1) break;
        }
    } else {
        // Move up: bubble swap upward.
        let i = 0;
        for (; i < items.length - 1; ++i) {
            if (items[i].ui_order === ord_2) break;
        }
        for (; i < items.length - 1; ++i) {
            const a = items[i];
            const b = items[i + 1];
            // Stop once the lower row of the pair was the source (UXP reads
            // the lower row's old order here, not the upper's).
            const o = b.ui_order;
            b.ui_order = a.ui_order;
            a.ui_order = o;
            if (o === ord_1) break;
        }
    }
}

function sortByUiOrder<T extends OrderedItem>(items: T[]): T[] {
    return [...items].sort((a, b) => a.ui_order - b.ui_order);
}

function enumerateObjects(scene: Scene): CueMolObject[] {
    let raw: unknown;
    try {
        raw = JSON.parse(scene.getSceneDataJSON());
    } catch {
        return [];
    }
    if (!Array.isArray(raw)) return [];
    const out: CueMolObject[] = [];
    for (let i = 1; i < raw.length; i++) {
        const item = raw[i] as { ID?: number };
        if (typeof item?.ID !== 'number') continue;
        const obj = scene.getObject(item.ID) as CueMolObject | null;
        if (obj) out.push(obj);
    }
    return out;
}

/** The 1-based place of `uid` among `items` by ui_order, or null. */
function positionOf(items: OrderedItem[], uid: number): number | null {
    const at = sortByUiOrder(items).findIndex((it) => it.uid === uid);
    return at < 0 ? null : at + 1;
}

/**
 * Record a move as `move_node`, by the places the node went among its
 * siblings (objects of the scene, or renderers of one object).
 *
 * @param from - its place before the move, from 1
 */
function recordMove(ctx: WorkerContext, scene: Scene, nodeId: number, nodeType: string, siblings: OrderedItem[], from: number | null): void {
    const to = positionOf(siblings, nodeId);
    if (to === null || from === null || to === from) return;
    recordOp(ctx, scene.uid, 'move_node', { nodeId, nodeType, by: to - from, to: null, end: null }, ['nodeId']);
}

export interface MoveNodeToArgs {
    sceneId: number;
    nodeId: number;
    nodeType: 'object' | 'renderer';
    /** Where among its siblings it goes. */
    dest: MoveDest;
}

/** Move an object, or a renderer within its object, to a place among its siblings. */
export function moveNodeTo(ctx: WorkerContext, args: MoveNodeToArgs): { ok: true } | { ok: false; error: string } {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, error: 'scene not found' };
    let siblings: OrderedItem[];
    let src: OrderedItem | null;
    if (args.nodeType === 'object') {
        siblings = enumerateObjects(scene) as unknown as OrderedItem[];
        src = scene.getObject(args.nodeId) as unknown as OrderedItem | null;
    } else {
        const rend = scene.getRenderer(args.nodeId) as Renderer | null;
        const obj = rend ? (rend.getClientObj() as CueMolObject | null) : null;
        siblings = obj ? (enumerateObjectRenderers(obj, scene) as unknown as OrderedItem[]) : [];
        src = rend as unknown as OrderedItem | null;
    }
    if (!src) return { ok: false, error: `no ${args.nodeType} with that uid` };
    const items = sortByUiOrder(siblings);
    const from = items.findIndex((it) => it.uid === src.uid);
    if (from < 0) return { ok: false, error: `the ${args.nodeType} is not among its siblings` };
    const target = moveTarget(args.dest, from, items.length, 'get_scene_state');
    if (typeof target === 'string') return { ok: false, error: target };
    const dst = items[target];
    if (dst.uid === src.uid) return { ok: true };
    withUndoTxn(scene, args.nodeType === 'object' ? 'Reorder objects' : 'Reorder renderers', () => {
        bubbleSwapOrder(items, src as OrderedItem, dst, 0);
    });
    return { ok: true };
}

export function reorderSceneNode(
    ctx: WorkerContext,
    args: ReorderSceneNodeArgs,
): ReorderSceneNodeResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false };

    if (args.kind === 'object') {
        if (args.sourceId === args.targetId) return { ok: false };
        const src = scene.getObject(args.sourceId) as CueMolObject | null;
        const dst = scene.getObject(args.targetId) as CueMolObject | null;
        if (!src || !dst) return { ok: false };

        const items = sortByUiOrder(enumerateObjects(scene));
        if (items.length === 0) return { ok: false };

        const from = positionOf(items as unknown as OrderedItem[], args.sourceId);
        withUndoTxn(scene, 'Reorder objects', () => {
            bubbleSwapOrder(
                items as unknown as OrderedItem[],
                src as unknown as OrderedItem,
                dst as unknown as OrderedItem,
                args.ori,
            );
            recordMove(ctx, scene, args.sourceId, 'object', items as unknown as OrderedItem[], from);
        });
        return { ok: true };
    }

    // renderer branch
    const src = scene.getRenderer(args.sourceId) as Renderer | null;
    if (!src) return { ok: false };
    const destObj = scene.getObject(args.destObjId) as CueMolObject | null;
    if (!destObj) return { ok: false };

    // Nesting one renderer group inside another drops the inner group's members
    // out of the scene tree for good: getGroupedRendListJSON is only one level
    // deep, so they match no filter. The renderer-side DnD planner already
    // refuses this (features/scene/sceneTreeDnd.ts); refuse it here too, since
    // the service is reachable without it.
    //
    // The existence of `destGroupName` is NOT checked here: every caller derives
    // it from a group node in the tree it just rendered. The Inspector, where a
    // user can type an arbitrary string into `Renderer.group`, is guarded in
    // genericProps.service.ts. See helpers/rendGroup.ts.
    if (args.destGroupName.trim() !== '' && isRendGroup(src)) {
        console.warn('reorderSceneNode: refusing to nest a renderer group');
        return { ok: false };
    }

    // Assign / clear rend.group BEFORE re-collecting siblings -- UXP does
    // the same; the group string is part of the rend, not of the obj.
    withUndoTxn(scene, 'Reorder renderers', () => {
        let currentGroup = '';
        try { currentGroup = src.group; } catch { /* ignore */ }
        if (args.destGroupName !== currentGroup) {
            recordPropWrite(ctx, scene.uid, { nodeType: 'renderer', nodeId: args.sourceId, propName: 'group', op: 'set', value: args.destGroupName });
            try { src.group = args.destGroupName; } catch { /* ignore */ }
        }

        // For "drop INTO rendGroup" with the group itself as target,
        // there is no ordering change -- UXP just updates rend.group and
        // returns. Match that.
        if (args.sourceId === args.targetId) return;

        const dst = scene.getRenderer(args.targetId) as Renderer | null;
        if (!dst) return;

        const items = sortByUiOrder(enumerateObjectRenderers(destObj, scene));
        if (items.length === 0) return;
        const from = positionOf(items as unknown as OrderedItem[], args.sourceId);

        bubbleSwapOrder(
            items as unknown as OrderedItem[],
            src as unknown as OrderedItem,
            dst as unknown as OrderedItem,
            args.ori,
        );
        recordMove(ctx, scene, args.sourceId, 'renderer', items as unknown as OrderedItem[], from);
    });
    return { ok: true };
}
