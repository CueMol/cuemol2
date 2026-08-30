/**
 * @file worker/server/services/props/types.ts
 * @description Argument and result shapes for the generic property calls.
 *
 * The entries themselves are a boundary DTO in `worker/shared/genericProps`,
 * re-exported here so the inspector keeps one import.
 */
import type { GenericPropEntry, PropTargetType, PropWriteMode } from '@renderer/worker/shared/genericProps';
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
