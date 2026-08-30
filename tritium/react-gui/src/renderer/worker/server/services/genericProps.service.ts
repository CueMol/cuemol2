// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Backs the generic property inspector (UXP `propeditor-generic-page`).
// `getGenericProps` dumps every property of a scene-tree node via the
// C++ `getPropsJSON()` bridge; `setGenericProp` writes one property back
// inside an undo transaction (UXP `commitPropChange`).

import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { resolvePropTarget } from '@renderer/worker/server/services/helpers/resolvePropTarget';
import { parseGenericProps } from '@renderer/worker/server/services/helpers/parseGenericProps';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import { listGroupChildRenderers } from '@renderer/worker/server/services/helpers/groupChildren';
import { checkGroupAssignment } from '@renderer/worker/server/services/helpers/rendGroup';
import type {
    GenericPropEntry,
    PropTargetType,
    PropWriteMode,
} from '@renderer/worker/shared/genericProps';

// The wire DTOs live in worker/shared/genericProps.ts (both threads use
// them); re-exported here so existing importers of this service keep working.
export type {
    GenericPropEntry,
    PropTargetType,
    PropWriteMode,
    PropWriteOpts,
} from '@renderer/worker/shared/genericProps';

// --- types ---

export interface GetGenericPropsArgs {
    sceneId: number;
    nodeId: number;
    nodeType: PropTargetType;
}

export interface GetGenericPropsResult {
    ok: boolean;
    entries: GenericPropEntry[];
    /** Node name shown in the inspector header. */
    displayName: string;
    /** Type label shown in the inspector header (renderer type / class name). */
    typeLabel: string;
    /**
     * UID of the molecule this node's selection properties are evaluated
     * against, when there is one. The selection picker counts matched atoms
     * against it; without it the field still edits the expression but shows no
     * hit count. See {@link resolveSelContextMol}.
     */
    molId?: number;
}


export interface SetGenericPropArgs {
    sceneId: number;
    nodeId: number;
    nodeType: PropTargetType;
    /** Property name to write. */
    propName: string;
    /** `set` writes `value`; `reset` restores the C++ default. */
    op: 'set' | 'reset';
    /** C++ type tag of the property (informational; reserved for object types). */
    valueType: string;
    /** New value for `op: 'set'`. */
    value?: string | number | boolean;
    /**
     * Write mode (default `commit`). `preview` writes without an undo txn for
     * live drag feedback; only valid with `op: 'set'` on plain (non-selection)
     * values.
     */
    mode?: PropWriteMode;
    /**
     * Pre-drag value, supplied with `mode: 'commit'` at the end of a realtime
     * drag. The value is restored (without undo) before the committed write so
     * the single recorded undo step is `originalValue -> value`, not
     * `lastPreview -> value`.
     */
    originalValue?: string | number | boolean;
    /**
     * Pre-drag default flag, supplied with `mode: 'commit'` / `'abort'`. When
     * true, the restore uses `resetProp` (default flag + value) instead of a
     * bare `setProp`, so the committed undo step re-trips the C++
     * default -> non-default transition (and undo reverts the default state).
     */
    originalWasDefault?: boolean;
    /**
     * Let a rendGroup's `visible` write carry its member renderers with it.
     * Set by the surfaces that present the flag as "show / hide this group"
     * (the structured inspector page); the raw property editor leaves it off
     * so it writes exactly the property it names.
     */
    cascadeGroupVisibility?: boolean;
}

export interface SetGenericPropResult {
    ok: boolean;
    /** Fresh full property list after the write; empty on failure. */
    entries: GenericPropEntry[];
}

export interface ResetGenericPropsArgs {
    sceneId: number;
    nodeId: number;
    nodeType: PropTargetType;
    /** Property names to reset. Caller filters to the modified keys. */
    propNames: string[];
}

/** One property write in a multi-write batch. */
export interface GenericPropWrite {
    /** Property name to write. */
    propName: string;
    /** `set` writes `value`; `reset` restores the C++ default. */
    op: 'set' | 'reset';
    /** C++ type tag of the property (informational). */
    valueType: string;
    /** New value for `op: 'set'`. */
    value?: string | number | boolean;
}

export interface SetGenericPropsArgs {
    sceneId: number;
    nodeId: number;
    nodeType: PropTargetType;
    /** Writes applied atomically inside one undo transaction. */
    writes: GenericPropWrite[];
}

// --- helpers ---

/** Read + parse a target's full property list. */
function collectProps(target: BaseWrapper): GenericPropEntry[] {
    const json = target.getPropsJSON();
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return [];
    }
    return parseGenericProps(raw);
}

/**
 * Scene.name is a read-only property -- its `.qif` declares
 * `redirect(getName, XXX) (readonly)`, so there is no `setProp` setter -- but a
 * scene CAN be renamed via `Scene::setName()`, which also fires the
 * `propChanged("name")` event the scene tree and tab strip rely on. So a scene
 * name write coming from the inspector is routed through `setName()` here. The
 * entries keep their honest `readonly: true`; only the Properties tab presents
 * the Name field as editable (the Generic tab stays read-only).
 */
function isSceneNameWrite(nodeType: PropTargetType, propName: string): boolean {
    return nodeType === 'scene' && propName === 'name';
}

/** Derive the header type label for a node. */
function typeLabelOf(target: BaseWrapper, nodeType: PropTargetType): string {
    const rec = target as unknown as Record<string, unknown>;
    if (nodeType === 'scene') return 'Scene';
    if (nodeType === 'view') return 'View';
    if (nodeType === 'renderer' || nodeType === 'rendGroup') {
        return (safeRead(() => rec.type_name) as string | undefined) ?? 'Renderer';
    }
    // object
    return (safeRead(() => rec.className) as string | undefined) ?? 'Object';
}

/**
 * Property names that hold the NAME of a molecule a non-molecular renderer
 * evaluates its selection against, in the order they are consulted: the
 * surface renderer's reference molecule, then a map renderer's display-limit
 * boundary molecule.
 */
const MOL_NAME_PROPS = ['target', 'bndry_molname'];

/** True for MolCoord and the subclasses the object lists treat as molecules. */
function isMoleculeClass(className: string): boolean {
    return (
        className === 'MolCoord' || className === 'Trajectory' || className.endsWith('Mol')
    );
}

/** `obj`'s uid when it is a molecule, else undefined. */
function molUidOf(obj: unknown): number | undefined {
    if (!obj) return undefined;
    const rec = obj as { getClassName?: () => string; uid?: number };
    const className = safeRead(() => rec.getClassName?.() ?? '') ?? '';
    if (!isMoleculeClass(className)) return undefined;
    const uid = safeRead(() => rec.uid);
    return typeof uid === 'number' ? uid : undefined;
}

/**
 * The molecule a node's selection properties are about.
 *
 * A molecular renderer is attached to its molecule, so its client object is
 * the answer. A surface or map renderer is attached to something else and
 * names its reference molecule in a string property instead, so fall back to
 * resolving that name in the scene. An Object node answers for itself.
 *
 * Returns undefined when the node has no molecule (a density map, a scene, a
 * renderer whose named target has since been deleted); the selection picker
 * then simply has no atom count to show.
 */
function resolveSelContextMol(
    scene: Scene | null,
    target: BaseWrapper,
    nodeType: PropTargetType,
): number | undefined {
    if (nodeType === 'object') return molUidOf(target);
    if (nodeType !== 'renderer' && nodeType !== 'rendGroup') return undefined;

    const client = safeRead(() => (target as unknown as Renderer).getClientObj());
    const clientMol = molUidOf(client);
    if (clientMol !== undefined) return clientMol;

    if (!scene) return undefined;
    const rec = target as unknown as Record<string, unknown>;
    for (const propName of MOL_NAME_PROPS) {
        const name = safeRead(() => rec[propName]);
        if (typeof name !== 'string' || name === '') continue;
        const uid = molUidOf(safeRead(() => scene.getObjectByName(name)));
        if (uid !== undefined) return uid;
    }
    return undefined;
}

// --- getGenericProps ---

function getGenericProps(
    ctx: WorkerContext,
    args: GetGenericPropsArgs,
): GetGenericPropsResult {
    const empty: GetGenericPropsResult = {
        ok: false,
        entries: [],
        displayName: '',
        typeLabel: '',
    };
    const { scene, target } = resolvePropTarget(ctx, args);
    if (!target) return empty;

    const entries = safeRead(() => collectProps(target)) ?? [];
    // A View has no `name` property - label it generically.
    const displayName =
        args.nodeType === 'view'
            ? 'View'
            : (safeRead(() => (target as unknown as { name: string }).name) as
                  | string
                  | undefined) ?? '';

    return {
        ok: true,
        entries,
        displayName,
        typeLabel: typeLabelOf(target, args.nodeType),
        molId: resolveSelContextMol(scene, target, args.nodeType),
    };
}

// --- setGenericProp ---

function setGenericProp(
    ctx: WorkerContext,
    args: SetGenericPropArgs,
): SetGenericPropResult {
    const fail: SetGenericPropResult = { ok: false, entries: [] };
    const { scene, target } = resolvePropTarget(ctx, args);
    if (!scene || !target) return fail;

    // Live preview during a drag: write without an undo txn (the 3D view still
    // redraws via the prop-change event, but nothing is recorded for undo).
    // Restricted to plain `set` writes; selection / reset never preview.
    if (args.mode === 'preview' && args.op === 'set') {
        try {
            target.setProp(args.propName, args.value);
        } catch (e) {
            console.warn('setGenericProp (preview) failed:', e);
            return fail;
        }
        // Skip the full re-dump: the parent drives the field from its local
        // draft during a drag and does not need normalised entries per frame.
        return { ok: true, entries: [] };
    }

    // Drag cancelled: restore the pre-drag snapshot, txn-free (nothing recorded
    // for undo). `resetProp` restores the default flag + value when the prop was
    // default before the drag; otherwise restore the original value. This undoes
    // the one-way default-flag flip a preview frame leaves behind.
    if (args.mode === 'abort' && args.op === 'set') {
        try {
            if (args.originalWasDefault) target.resetProp(args.propName);
            else target.setProp(args.propName, args.value);
        } catch (e) {
            console.warn('setGenericProp (abort) failed:', e);
            return fail;
        }
        return { ok: true, entries: [] };
    }

    const label =
        args.op === 'reset'
            ? `Reset property: ${args.propName}`
            : `Change property: ${args.propName}`;

    // Renaming a renderer group must re-assign every member's `group`
    // string (membership is a name reference) and keep the name unique
    // scene-wide -- the same contract as the tree renameNode service.
    // Collect members by the OLD name before the write happens.
    let grpRename: { children: Renderer[]; newName: string } | null = null;
    if (
        args.op === 'set' &&
        args.nodeType === 'rendGroup' &&
        args.propName === 'name'
    ) {
        const newName = String(args.value ?? '').trim();
        if (newName.length === 0) return fail;
        const grp = target as unknown as Renderer;
        const dup = safeRead(() => scene.getRendByName(newName) as Renderer | null);
        if (dup && safeRead(() => dup.uid) !== safeRead(() => grp.uid)) {
            return fail;
        }
        grpRename = {
            children: listGroupChildRenderers(scene, grp),
            newName,
        };
    }

    // A group's own `visible` flag draws nothing on its own: RendGroup::display()
    // is empty and the C++ scene loop consults each renderer's own flag. Callers
    // that present this as "hide the group" therefore ask for the members to
    // follow, the same cascade the scene tree's eye toggle performs
    // (setNodeVisible / UXP `toggleVisibleRendGrp`). The raw property editor
    // does not ask, and writes only the flag it names.
    const grpVisibility =
        args.op === 'set' &&
        args.cascadeGroupVisibility === true &&
        args.propName === 'visible' &&
        args.nodeType === 'rendGroup'
            ? listGroupChildRenderers(scene, target as unknown as Renderer)
            : null;

    // Group membership is an unvalidated name reference, so a `group` write
    // naming no existing group (a typo, or a group deleted meanwhile) drops the
    // renderer out of getGroupedRendListJSON -- it keeps drawing but is gone
    // from the scene tree, and every way to select / hide / delete it starts
    // there. Reject instead of writing. See helpers/rendGroup.ts.
    if (
        args.op === 'set' &&
        args.propName === 'group' &&
        (args.nodeType === 'renderer' || args.nodeType === 'rendGroup')
    ) {
        const reason = checkGroupAssignment(
            scene,
            target as unknown as Renderer,
            String(args.value ?? ''),
        );
        if (reason) {
            console.warn(`setGenericProp: refusing group write -- ${reason}`);
            return fail;
        }
    }

    try {
        // Realtime commit: a preview drag already moved the prop to its last
        // frame value (txn-free) and flipped its default flag to non-default.
        // Restore the pre-drag state first (still txn-free, so not recorded) so
        // the single undo step inside the txn is `originalValue -> value`. When
        // the prop was default, restore via `resetProp` (flag + value) so the
        // in-txn `setProp` re-trips the default -> non-default transition and
        // undo reverts the default state too.
        if (args.op === 'set' && args.originalValue !== undefined) {
            if (args.originalWasDefault) target.resetProp(args.propName);
            else target.setProp(args.propName, args.originalValue);
        }
        withUndoTxn(scene, label, () => {
            if (args.op === 'reset') {
                target.resetProp(args.propName);
            } else if (isSceneNameWrite(args.nodeType, args.propName)) {
                // Scene.name has no property setter; rename via setName(), which
                // also fires propChanged("name") (see isSceneNameWrite).
                scene.setName(String(args.value ?? ''));
            } else if (grpRename) {
                target.setProp('name', grpRename.newName);
                for (const c of grpRename.children) {
                    try { c.group = grpRename.newName; } catch { /* ignore */ }
                }
            } else if (args.valueType.startsWith('object<MolSelection>')) {
                // Selection properties need a compiled SelCommand, not a raw
                // string (UXP `commitPropChange` MolSelection branch). An empty
                // string compiles to "select all".
                const sel = makeSel(ctx, String(args.value ?? ''), scene.uid);
                if (!sel) throw new Error(`bad selection: ${String(args.value)}`);
                target.setProp(args.propName, sel.wrapped);
            } else {
                target.setProp(args.propName, args.value);
                if (grpVisibility) {
                    for (const c of grpVisibility) {
                        try { c.visible = args.value as boolean; } catch { /* ignore */ }
                    }
                }
            }
        });
    } catch (e) {
        console.warn('setGenericProp failed:', e);
        return fail;
    }

    // Re-dump so the renderer sees normalised values (C++ may clamp /
    // round) and updated isdefault flags.
    return { ok: true, entries: safeRead(() => collectProps(target)) ?? [] };
}

// --- resetGenericProps ---

/**
 * Reset several properties to their C++ defaults inside a SINGLE undo
 * transaction (used by "Reset all to default"). Looping `setGenericProp`
 * op:'reset' from the renderer would record one undo step per property; this
 * collapses them into one step (one Cmd+Z restores the whole reset).
 */
function resetGenericProps(
    ctx: WorkerContext,
    args: ResetGenericPropsArgs,
): SetGenericPropResult {
    const fail: SetGenericPropResult = { ok: false, entries: [] };
    const { scene, target } = resolvePropTarget(ctx, args);
    if (!scene || !target || args.propNames.length === 0) return fail;

    const label =
        args.propNames.length === 1
            ? `Reset property: ${args.propNames[0]}`
            : `Reset ${args.propNames.length} properties`;

    try {
        withUndoTxn(scene, label, () => {
            for (const name of args.propNames) {
                // Skip props that vanished because a parent object property
                // was swapped earlier in this very loop (e.g. resetting
                // `coloring` before `coloring.xxx`) -- UXP resetAllToDefault's
                // `cuemol.hasProp` guard. Unexpected errors still roll back
                // the whole txn below.
                if (!target.hasProp(name)) {
                    console.warn(`resetGenericProps: skipping missing prop "${name}"`);
                    continue;
                }
                target.resetProp(name);
            }
        });
    } catch (e) {
        console.warn('resetGenericProps failed:', e);
        return fail;
    }

    return { ok: true, entries: safeRead(() => collectProps(target)) ?? [] };
}

// --- setGenericProps ---

/**
 * Apply several property writes (set / reset) to a single node in ONE undo
 * transaction. Used when one UI action must change several properties at once
 * yet collapse to a single undo step (e.g. the atomintr "Dashed" toggle, which
 * rewrites all six stipple pattern values together). Looping `setGenericProp`
 * from the renderer would record one undo step per property.
 *
 * No drag/preview modes: every write is committed. Selection-typed properties
 * follow the same compiled-SelCommand branch as `setGenericProp`.
 */
function setGenericProps(
    ctx: WorkerContext,
    args: SetGenericPropsArgs,
): SetGenericPropResult {
    const fail: SetGenericPropResult = { ok: false, entries: [] };
    const { scene, target } = resolvePropTarget(ctx, args);
    if (!scene || !target || args.writes.length === 0) return fail;

    const label =
        args.writes.length === 1
            ? `Change property: ${args.writes[0].propName}`
            : `Change ${args.writes.length} properties`;

    try {
        withUndoTxn(scene, label, () => {
            for (const w of args.writes) {
                if (w.op === 'reset') {
                    target.resetProp(w.propName);
                } else if (isSceneNameWrite(args.nodeType, w.propName)) {
                    // Scene.name has no property setter; rename via setName().
                    scene.setName(String(w.value ?? ''));
                } else if (w.valueType.startsWith('object<MolSelection>')) {
                    const sel = makeSel(ctx, String(w.value ?? ''), scene.uid);
                    if (!sel) throw new Error(`bad selection: ${String(w.value)}`);
                    target.setProp(w.propName, sel.wrapped);
                } else {
                    target.setProp(w.propName, w.value);
                }
            }
        });
    } catch (e) {
        console.warn('setGenericProps failed:', e);
        return fail;
    }

    return { ok: true, entries: safeRead(() => collectProps(target)) ?? [] };
}

export const services = {
    getGenericProps,
    setGenericProp,
    setGenericProps,
    resetGenericProps,
};
