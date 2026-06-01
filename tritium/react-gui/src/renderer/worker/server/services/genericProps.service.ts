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

    const label =
        args.op === 'reset'
            ? `Reset property: ${args.propName}`
            : `Change property: ${args.propName}`;

    try {
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
