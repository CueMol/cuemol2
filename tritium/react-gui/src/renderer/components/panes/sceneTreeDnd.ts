/**
 * @file sceneTreeDnd.ts
 * @description Pure drag-drop reorder logic for the scene tree.
 *
 * Extracted from `ScenePane.tsx`: `planSceneNodeMove` is a ~110-line pure
 * function (no React) that resolves a (source, target, orientation) drag
 * into a `MoveSceneNodeArgs`, mirroring UXP `workspace_panel_dnd.js`. It is
 * exercised end-to-end by `__test__/scenePaneDnd.test.tsx` via `ScenePane`.
 *
 * @module sceneTreeDnd
 */

import type { SceneNodeType, SceneTreeNode } from "../../worker/shared/sceneTreeTypes";

/** Mime type for the JSON payload carried during scene-tree DnD. */
export const SCENE_NODE_MIME = "application/x-scene-node";

/** Source info written to dataTransfer on dragstart. */
export interface DragSourcePayload {
    id: number;
    type: SceneNodeType;
}

/** Orientation of a drop relative to the target row. */
export type DragOri = -1 | 0 | 1;

/** Computed move-intent passed to the worker after a drop. */
export type MoveSceneNodeArgs =
    | { kind: "object"; sourceId: number; targetId: number; ori: -1 | 1 }
    | {
        kind: "renderer";
        sourceId: number;
        destObjId: number;
        destGroupName: string;
        targetId: number;
        ori: -1 | 0 | 1;
    };

/**
 * Decide whether a (source, target, ori) combo represents a valid drop.
 * Mirrors UXP `workspace_panel_dnd.js` `canDrop` (subset — multi-select
 * deferred). Caller passes both nodes plus an `ori`.
 *
 * Returns the resolved `MoveSceneNodeArgs` on accept, or null on reject.
 * The parentLookup gives the parent node for any tree id (returns the
 * scene node for top-level objects, or the parent rendGroup / object
 * for nested renderers).
 */
export function planSceneNodeMove(
    src: SceneTreeNode,
    tgt: SceneTreeNode,
    ori: DragOri,
    parentLookup: (id: number) => SceneTreeNode | null,
): MoveSceneNodeArgs | null {
    if (src.id === tgt.id) return null;

    // Object → object reorder.
    if (src.type === "object") {
        if (tgt.type !== "object") return null;
        if (ori === 0) return null;  // dropping "into" object not supported
        return { kind: "object", sourceId: src.id, targetId: tgt.id, ori };
    }

    // Renderer / rendGroup → renderer / rendGroup.
    if (src.type === "renderer" || src.type === "rendGroup") {
        if (tgt.type !== "renderer" && tgt.type !== "rendGroup") return null;

        const srcPar = parentLookup(src.id);
        const tgtPar = parentLookup(tgt.id);
        if (!srcPar || !tgtPar) return null;

        // Resolve dest obj + group, mirroring UXP `dropImpl` table.
        let destObj: SceneTreeNode | null = null;
        let destGroupName = "";

        // "Drop INTO rendGroup" — only valid for source=renderer (rendgrps
        // cannot nest). UXP: `if elem.type=="rendGroup" && ori==0`.
        if (tgt.type === "rendGroup" && ori === 0) {
            if (src.type !== "renderer") return null;
            destObj = parentLookup(tgt.id);  // group's parent (an object)
            if (!destObj || destObj.type !== "object") return null;
            destGroupName = tgt.name;
            // UXP: if group has children, snap target to its first child;
            // otherwise keep target = group uid (worker treats sourceId ==
            // targetId as "no slot swap, just update rend.group").
            const targetId = tgt.children.length > 0
                ? tgt.children[0].id
                : tgt.id;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: destObj.id,
                destGroupName,
                targetId,
                ori: 0,
            };
        }

        // Same parent: in-place reorder. Source is allowed to be a
        // rendGroup as long as we stay within the same object.
        if (srcPar.id === tgtPar.id) {
            destObj = srcPar.type === "object" ? srcPar : parentLookup(srcPar.id);
            if (!destObj || destObj.type !== "object") return null;
            destGroupName = srcPar.type === "rendGroup" ? srcPar.name : "";
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: destObj.id,
                destGroupName,
                targetId: tgt.id,
                ori,
            };
        }

        // Cross-parent move. rendGroups cannot move across parents.
        if (src.type === "rendGroup") return null;

        // Allowed transitions (UXP):
        //   srcPar=object,    tgtPar=rendGroup (same obj): obj → group
        //   srcPar=rendGroup, tgtPar=object   (same obj): group → root
        //   srcPar=rendGroup, tgtPar=rendGroup(same obj): group → group
        if (srcPar.type === "object" && tgtPar.type === "rendGroup") {
            // tgtPar's parent must equal srcPar (same object).
            const grpParent = parentLookup(tgtPar.id);
            if (!grpParent || grpParent.id !== srcPar.id) return null;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: srcPar.id,
                destGroupName: tgtPar.name,
                targetId: tgt.id,
                ori,
            };
        }
        if (srcPar.type === "rendGroup" && tgtPar.type === "object") {
            const grpParent = parentLookup(srcPar.id);
            if (!grpParent || grpParent.id !== tgtPar.id) return null;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: tgtPar.id,
                destGroupName: "",
                targetId: tgt.id,
                ori,
            };
        }
        if (srcPar.type === "rendGroup" && tgtPar.type === "rendGroup") {
            const a = parentLookup(srcPar.id);
            const b = parentLookup(tgtPar.id);
            if (!a || !b || a.id !== b.id) return null;
            return {
                kind: "renderer",
                sourceId: src.id,
                destObjId: a.id,
                destGroupName: tgtPar.name,
                targetId: tgt.id,
                ori,
            };
        }
    }
    return null;
}

/** Y-position → orientation. Top 1/3 = -1, middle = 0, bottom 1/3 = +1. */
export function computeOri(rect: DOMRect, clientY: number): DragOri {
    const rel = clientY - rect.top;
    const t = rect.height / 3;
    if (rel < t) return -1;
    if (rel > rect.height - t) return 1;
    return 0;
}
