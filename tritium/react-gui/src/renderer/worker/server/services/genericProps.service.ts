// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Backs the generic property inspector (UXP `propeditor-generic-page`).
// `getGenericProps` dumps every property of a scene-tree node via the
// C++ `getPropsJSON()` bridge; `setGenericProp` writes one property back
// inside an undo transaction (UXP `commitPropChange`).

import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { WorkerContext } from '../types/WorkerContext';
import { withUndoTxn } from './withUndoTxn';
import { resolvePropTarget, type PropTargetType } from './helpers/resolvePropTarget';
import { parseGenericProps, type GenericPropEntry } from './helpers/parseGenericProps';
import { makeSel } from './helpers/makeSel';
import { safeRead } from './helpers/safeRead';

export type { GenericPropEntry } from './helpers/parseGenericProps';
export type { PropTargetType } from './helpers/resolvePropTarget';

// ─── types ────────────────────────────────────────────────────────────────

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
}

/**
 * Drag-write mode for live numeric editing:
 *   - `commit` (default): write inside an undo transaction (one undo step).
 *   - `preview`: write WITHOUT a transaction, so the 3D view redraws but the
 *     change is not recorded for undo (used every frame during a drag).
 *   - `abort`: restore the pre-drag snapshot WITHOUT a transaction (used when a
 *     drag is cancelled); restores the default flag too when `originalWasDefault`.
 */
export type PropWriteMode = 'preview' | 'commit' | 'abort';

/** Optional per-write drag options threaded through the inspector `onSet`. */
export interface PropWriteOpts {
    mode?: PropWriteMode;
    originalValue?: string | number | boolean;
    originalWasDefault?: boolean;
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

// ─── helpers ──────────────────────────────────────────────────────────────

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

// ─── getGenericProps ──────────────────────────────────────────────────────

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
    const { target } = resolvePropTarget(ctx, args);
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
    };
}

// ─── setGenericProp ───────────────────────────────────────────────────────

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
            } else if (args.valueType.startsWith('object<MolSelection>')) {
                // Selection properties need a compiled SelCommand, not a raw
                // string (UXP `commitPropChange` MolSelection branch). An empty
                // string compiles to "select all".
                const sel = makeSel(ctx, String(args.value ?? ''), scene.uid);
                if (!sel) throw new Error(`bad selection: ${String(args.value)}`);
                target.setProp(args.propName, sel.wrapped);
            } else {
                target.setProp(args.propName, args.value);
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

// ─── resetGenericProps ────────────────────────────────────────────────────

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
            for (const name of args.propNames) target.resetProp(name);
        });
    } catch (e) {
        console.warn('resetGenericProps failed:', e);
        return fail;
    }

    return { ok: true, entries: safeRead(() => collectProps(target)) ?? [] };
}

// ─── setGenericProps ──────────────────────────────────────────────────────

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
