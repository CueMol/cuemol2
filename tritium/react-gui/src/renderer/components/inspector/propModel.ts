/**
 * @file components/inspector/propModel.ts
 * @description Pure model helpers for the inspector's per-property reset UI.
 *
 * These functions centralize the "is this property modified?" predicate and the
 * key-set math behind the per-property / per-group / all reset actions, so the
 * row components stay dumb presenters that never compute state themselves. They
 * are pure (no React, no I/O) and unit-tested in `__test__/propModel.test.ts`.
 */

import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';

/**
 * Property keys that the inspector never resets, even when they expose a
 * default. Resetting a renderer's name or its selection is meaningless /
 * destructive, so neither shows a per-property reset nor is touched by
 * "Reset all to default" (UXP parity: `propeditor-generic-page.resetAllToDefault`
 * skips `name` and `sel`).
 */
export const NON_RESETTABLE_KEYS: ReadonlySet<string> = new Set(['name', 'sel']);

/**
 * A property is "modified" iff it exposes a resettable default and is not
 * currently at it. `isdefault` is only meaningful when `hasdefault` is true
 * (see `parseGenericProps`), so both flags are required.
 *
 * @param e - the property entry
 * @returns true when the property differs from its default value
 */
export function isModified(e: GenericPropEntry): boolean {
    return e.hasdefault && !e.isdefault;
}

/**
 * Whether the inspector offers a reset for this property: it must expose a
 * default and not be on the never-reset list.
 *
 * @param e - the property entry
 * @returns true when a reset affordance should be shown for it
 */
export function isResettable(e: GenericPropEntry): boolean {
    return e.hasdefault && !NON_RESETTABLE_KEYS.has(e.key);
}

/**
 * Keys of every resettable + modified entry, in input order (for "Reset all to
 * default"). Excludes never-reset keys (name / sel) and properties already at
 * their default.
 *
 * @param entries - the full property list
 * @returns the keys to reset
 */
export function modifiedKeys(entries: GenericPropEntry[]): string[] {
    return entries.filter((e) => isResettable(e) && isModified(e)).map((e) => e.key);
}

/**
 * Carrier shape for the default-value annotation. The `defaultValue` field is
 * populated only once the C++ `getPropsJSON` emits it (a later phase); until
 * then it is absent and the annotation is omitted.
 */
interface DefaultValueCarrier {
    /** C++ type tag: boolean|integer|real|string|enum|object<...>. */
    type: string;
    /** Default value, when known. */
    defaultValue?: string | number | boolean;
}

/**
 * Pre-format a property's default value for the hover annotation
 * (e.g. `on` / `off` / `1.00`). Returns undefined when no default value is
 * available, so callers can omit the annotation entirely.
 *
 * @param e - the property entry
 * @returns the formatted default label, or undefined
 */
export function formatDefaultLabel(e: DefaultValueCarrier): string | undefined {
    if (e.defaultValue === undefined) return undefined;
    switch (e.type) {
        case 'boolean':
            return e.defaultValue ? 'on' : 'off';
        case 'real':
            return Number(e.defaultValue).toFixed(2);
        default:
            return String(e.defaultValue);
    }
}
