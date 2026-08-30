/**
 * @file worker/server/services/clipboard/types.ts
 * @description Argument and result shapes for copy and paste.
 */

export type ClipboardKind = 'object' | 'renderer' | 'style' | 'camera';

/**
 * XML payload shape for kind 'renderer'. 'single' is one renderer
 * serialized with toXML; 'rendArray' is a renderer array serialized with
 * rendGrpToXML / arrayToXML (UXP clipboard type "qscrendary" -- element 0
 * of the restored array is the source group name). The clipboard kind
 * stays 'renderer' for both so ctxmenu Paste gating matches UXP
 * (qscrend | qscrendary enable the same item).
 */
export type ClipboardForm = 'single' | 'rendArray';

export interface CopyNodeArgs {
    sceneId: number;
    nodeId: number;
    nodeType: 'object' | 'renderer' | 'rendGroup' | 'style' | 'camera';
    /**
     * Style scope id (0 for global, scene.uid for scene-local). Required
     * when `nodeType === 'style'`; the renderer reads it from the tree
     * node's `styleInfo.scopeId` and forwards it. Ignored for other types.
     */
    scopeId?: number;
    /**
     * Camera name. Required when `nodeType === 'camera'` because cameras
     * are keyed by name at the Scene API level (the tree-row id for
     * cameras is a synthesised negative integer with no C++ meaning).
     * Ignored for other types.
     */
    cameraName?: string;
}

export interface CopyNodeResult {
    ok: boolean;
    /** What was serialized (renderer for both renderer and rendGroup). */
    kind: ClipboardKind | null;
    /** Payload shape; 'single' for everything but a group copy. */
    form?: ClipboardForm;
    /** Source node name, carried as a display hint only. */
    name?: string;
    /** Serialized XML bytes, for the caller to put on the clipboard. */
    bytes?: Uint8Array;
}

export interface PasteNodeArgs {
    sceneId: number;
    /** What the payload holds, from the clipboard read. */
    kind: ClipboardKind;
    /** Serialized XML bytes to restore. */
    bytes: Uint8Array;
    /** Payload shape; defaults to 'single'. */
    form?: ClipboardForm;
    /**
     * Source node name, used only as the fallback when the restored XML
     * carries no usable name. A payload copied in another app supplies no
     * name, which is why every branch prefers the restored object's own.
     */
    name?: string;
    /** When pasting a renderer onto an object row, the object's uid. */
    targetObjId?: number;
    /**
     * When pasting a renderer onto a rendgroup row, the group's uid. The
     * worker resolves the group's parent mol via `group.getClientObj()`
     * and sets `rend.group = group.name` so the new renderer appears
     * under the group. Mutually exclusive with `targetObjId`.
     */
    targetGroupId?: number;
}

export interface PasteNodeResult {
    ok: boolean;
    /** New uid of the pasted node, or null. */
    newId: number | null;
    /** Final name (after uniquification), or empty. */
    newName: string;
}

export interface CopyNodesArgs {
    sceneId: number;
    /** Tree-row ids of the selected nodes, in display order. */
    nodeIds: number[];
    /** Node type per id, positionally aligned with `nodeIds`. */
    nodeTypes: string[];
}

export interface CopyNodesResult {
    ok: boolean;
    kind: ClipboardKind | null;
    /** Always 'rendArray' when ok -- a multi copy is a renderer array. */
    form?: ClipboardForm;
    /** Empty: a multi copy has no single source name. */
    name?: string;
    /** Serialized XML bytes, for the caller to put on the clipboard. */
    bytes?: Uint8Array;
    /**
     * Why a copy was refused, so the caller can show UXP's alert text:
     * 'mixed' -- the selection spans more than one kind;
     * 'objectUnsupported' -- multiple objects, which UXP declines too.
     */
    reason?: 'mixed' | 'objectUnsupported' | 'nodeTypesMismatch';
}
