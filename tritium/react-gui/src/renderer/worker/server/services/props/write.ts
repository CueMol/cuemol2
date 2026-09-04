/**
 * @file worker/server/services/props/write.ts
 * @description Writing properties back, each write its own undo step.
 *
 * Most properties go straight through. The exceptions are the ones whose
 * meaning reaches past the object holding them: `group` has to name a group
 * that exists (a typo used to strand the renderer outside the scene tree),
 * `visible` on a group can be asked to cascade to its members, a
 * selection has to compile against the molecule it belongs to, and a map's
 * `map_type` decides which default style its renderers carry.
 */
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { withUndoTxn } from '../withUndoTxn';
import { resolvePropTarget } from './target';
import { NON_RESETTABLE_KEYS, isMolSelectionType } from '@renderer/worker/shared/genericProps';
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import { listGroupChildRenderers } from '@renderer/worker/server/services/helpers/groupChildren';
import { checkGroupAssignment } from '@renderer/worker/server/services/helpers/rendGroup';
import { syncMapRendererStyles } from '@renderer/worker/server/services/helpers/mapRendererStyles';
import type { Object as CueObject } from '@cuemol/core/src/wrappers/Object';
import { collectProps } from './read';
import { isSceneNameWrite } from './selContext';
import type {
    ResetGenericPropsArgs,
    SetGenericPropArgs,
    SetGenericPropResult,
    SetGenericPropsArgs,
} from './types';
export function setGenericProp(
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
        if (args.originalWasDefault && NON_RESETTABLE_KEYS.has(args.propName)) return fail;
        try {
            if (args.originalWasDefault) target.resetProp(args.propName);
            else target.setProp(args.propName, args.value);
        } catch (e) {
            console.warn('setGenericProp (abort) failed:', e);
            return fail;
        }
        return { ok: true, entries: [] };
    }

    // A renderer's `name` and `sel` have no default to go back to (see
    // NON_RESETTABLE_KEYS). Refused before the transaction opens: C++ would
    // happily write the registered "" default -- a nameless renderer group
    // orphans its members and matches every ungrouped renderer -- and an
    // empty committed transaction clears the redo stack.
    if (args.op === 'reset' && NON_RESETTABLE_KEYS.has(args.propName)) {
        console.warn(`setGenericProp: refusing reset of non-resettable "${args.propName}"`);
        return fail;
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
            } else if (isMolSelectionType(args.valueType)) {
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
            // A map's kind picks the default style of its renderers (see
            // helpers/mapRendererStyles.ts); re-derive it in the same txn so
            // one undo reverts the kind and the styles together.
            if (args.nodeType === 'object' && args.propName === 'map_type') {
                syncMapRendererStyles(target as unknown as CueObject);
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
export function resetGenericProps(
    ctx: WorkerContext,
    args: ResetGenericPropsArgs,
): SetGenericPropResult {
    const fail: SetGenericPropResult = { ok: false, entries: [] };
    const { scene, target } = resolvePropTarget(ctx, args);
    if (!scene || !target || args.propNames.length === 0) return fail;

    // `name` / `sel` are never reset (UXP resetAllToDefault skips them too).
    const propNames = args.propNames.filter((n) => !NON_RESETTABLE_KEYS.has(n));
    if (propNames.length !== args.propNames.length) {
        console.warn('resetGenericProps: skipping non-resettable name / sel');
    }
    if (propNames.length === 0) return fail;

    const label =
        propNames.length === 1
            ? `Reset property: ${propNames[0]}`
            : `Reset ${propNames.length} properties`;

    try {
        withUndoTxn(scene, label, () => {
            for (const name of propNames) {
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
export function setGenericProps(
    ctx: WorkerContext,
    args: SetGenericPropsArgs,
): SetGenericPropResult {
    const fail: SetGenericPropResult = { ok: false, entries: [] };
    const { scene, target } = resolvePropTarget(ctx, args);
    if (!scene || !target || args.writes.length === 0) return fail;
    if (args.writes.some((w) => w.op === 'reset' && NON_RESETTABLE_KEYS.has(w.propName))) {
        console.warn('setGenericProps: refusing a reset of non-resettable name / sel');
        return fail;
    }

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
                } else if (isMolSelectionType(w.valueType)) {
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
