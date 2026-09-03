/**
 * @file worker/shared/genericProps.ts
 * @description The property-bridge DTOs, shared by both threads.
 *
 * The generic property inspector reads a node's properties as a flat list of
 * `GenericPropEntry` rows and writes them back one (or several) at a time.
 * The wire shapes live here rather than in the service that produces them:
 * the UI reads them in ~50 files, and importing a worker service module for a
 * type is what the thread boundary exists to prevent.
 */

import type { SceneNodeType } from './sceneTreeTypes'

/**
 * Node kinds the generic property inspector can target. Extends the
 * scene-tree `SceneNodeType` with `view` -- the View has no scene-tree node
 * (it is reached via the View menu) but its properties are edited through
 * the same generic path.
 */
export type PropTargetType = SceneNodeType | 'view'

/**
 * Top-level property keys that are never reset to a default, whatever the
 * C++ property table declares. A renderer's `name` is its identity (group
 * membership and lookups key on it) and its `sel` is the edit the user made;
 * resetting either is meaningless or destructive. UXP parity:
 * `propeditor-generic-page.resetAllToDefault` skips both. The worker refuses
 * the write and reports them as having no default; the inspector offers no
 * reset for them.
 */
export const NON_RESETTABLE_KEYS: ReadonlySet<string> = new Set(['name', 'sel'])

/** A single property row consumed by the generic property inspector. */
export interface GenericPropEntry {
    /** Property name; dot-path (`section.width`) for a nested object's child. */
    key: string
    /** C++ type tag: boolean|integer|real|string|enum|object<...>. */
    type: string
    /** Current value; `<node>` for a nested-object container row. */
    value: string | number | boolean
    /** True when the property cannot be written. */
    readonly: boolean
    /** True when the property exposes a resettable default value. */
    hasdefault: boolean
    /** True when the property is currently at its default value. */
    isdefault: boolean
    /**
     * The value this property would be reset to (style-resolved default for
     * renderers, else the class default). Present only for scalar / enum
     * properties that expose a default; absent for object types.
     */
    defaultValue?: string | number | boolean
    /** Allowed string IDs - present only for `enum` properties. */
    enumdef?: string[]
    /** True for a non-string-convertible nested object (the container row). */
    isContainer: boolean
    /** Dot-nesting depth (0 = top-level, 1 = direct child of an object, ...). */
    depth: number
}

/**
 * How a write is recorded.
 *
 *   - `commit` (default): one undo transaction.
 *   - `preview`: write without a transaction, so the change is not recorded
 *     for undo (used every frame during a realtime drag).
 *   - `abort`: restore the pre-drag snapshot without a transaction (used when
 *     a realtime drag is cancelled); restores the default flag too when
 *     `originalWasDefault`.
 */
export type PropWriteMode = 'preview' | 'commit' | 'abort'

/** Optional per-write drag options threaded through the inspector `onSet`. */
export interface PropWriteOpts {
    mode?: PropWriteMode
    originalValue?: string | number | boolean
    originalWasDefault?: boolean
    /**
     * Let a rendGroup's `visible` write carry its member renderers with it.
     * Set by the surfaces that present the flag as "show / hide this group"
     * (the structured inspector page); the raw property editor leaves it off
     * so it writes exactly the property it names.
     */
    cascadeGroupVisibility?: boolean
}
