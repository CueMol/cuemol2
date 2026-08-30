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
            const o = a.ui_order;
            a.ui_order = b.ui_order;
            b.ui_order = o;
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

        withUndoTxn(scene, 'Reorder objects', () => {
            bubbleSwapOrder(
                items as unknown as OrderedItem[],
                src as unknown as OrderedItem,
                dst as unknown as OrderedItem,
                args.ori,
            );
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

        bubbleSwapOrder(
            items as unknown as OrderedItem[],
            src as unknown as OrderedItem,
            dst as unknown as OrderedItem,
            args.ori,
        );
    });
    return { ok: true };
}
