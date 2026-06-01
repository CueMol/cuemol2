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
 */
export type PropWriteMode = 'preview' | 'commit';

/** Optional per-write drag options threaded through the inspector `onSet`. */
export interface PropWriteOpts {
    mode?: PropWriteMode;
    originalValue?: string | number | boolean;
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
}

export interface SetGenericPropResult {
    ok: boolean;
    /** Fresh full property list after the write; empty on failure. */
    entries: GenericPropEntry[];
}

// ─── helpers ──────────────────────────────────────────────────────────────

function safeRead<T>(read: () => T): T | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}

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

    const label =
        args.op === 'reset'
            ? `Reset property: ${args.propName}`
            : `Change property: ${args.propName}`;

    try {
        // Realtime commit: a preview drag already moved the prop to its last
        // frame value (txn-free). Restore the pre-drag value first (still
        // txn-free, so not recorded) so the single undo step inside the txn is
        // `originalValue -> value`.
        if (args.op === 'set' && args.originalValue !== undefined) {
            target.setProp(args.propName, args.originalValue);
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

export const services = { getGenericProps, setGenericProp };
