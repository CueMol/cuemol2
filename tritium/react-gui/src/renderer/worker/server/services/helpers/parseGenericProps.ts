// Runs in Web Worker thread.
//
// Parses the JSON produced by a C++ wrapper's `getPropsJSON()` into a flat
// list of `GenericPropEntry` rows for the generic property inspector.
//
// JSON shape (C++ `qlib::LScrObjBase::getPropsJSONImpl`, src/qlib/LScrObjects.cpp):
//   [ { name, readonly, hasdefault, isdefault?, type, value, enumdef? }, ... ]
// where `type` is one of boolean|integer|real|string|enum|object<...>.
// For `object<...>` properties the `value` is either a display string
// (string-convertible objects such as colors / selections) or a nested
// array (the child object's own getPropsJSON).
//
// First stage: top-level properties only. Nested object properties are NOT
// recursed into - C++ `LScrObjBase::setProperty` does not accept dot-paths,
// so a nested property cannot be written back generically yet. A
// non-string-convertible `object<...>` property is therefore emitted as a
// single read-only `<node>` row.

/** Placeholder value shown for a non-string-convertible nested object. */
export const CONTAINER_VALUE = '<node>';

/** A single property row consumed by the generic property inspector. */
export interface GenericPropEntry {
    /** Property name (top-level; dot-paths reserved for a later stage). */
    key: string;
    /** C++ type tag: boolean|integer|real|string|enum|object<...>. */
    type: string;
    /** Current value; `<node>` for an unexpanded nested object. */
    value: string | number | boolean;
    /** True when the property cannot be written. */
    readonly: boolean;
    /** True when the property exposes a resettable default value. */
    hasdefault: boolean;
    /** True when the property is currently at its default value. */
    isdefault: boolean;
    /**
     * The value this property would be reset to (style-resolved default for
     * renderers, else the class default). Present only for scalar / enum
     * properties that expose a default; absent for object types.
     */
    defaultValue?: string | number | boolean;
    /** Allowed string IDs - present only for `enum` properties. */
    enumdef?: string[];
    /** True for a non-string-convertible nested object (not editable yet). */
    isContainer: boolean;
    /** Dot-nesting depth (always 0 in the first stage). */
    depth: number;
}

/** Raw element shape of the `getPropsJSON()` array. */
interface RawPropItem {
    name: string;
    readonly: boolean;
    hasdefault: boolean;
    isdefault?: boolean;
    default?: string | number | boolean;
    type: string;
    value: string | number | boolean | RawPropItem[];
    enumdef?: string[];
}

/**
 * Convert a parsed `getPropsJSON()` array into inspector rows.
 *
 * @param raw - the array returned by `JSON.parse(target.getPropsJSON())`
 */
export function parseGenericProps(raw: unknown): GenericPropEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: GenericPropEntry[] = [];
    for (const item of raw as RawPropItem[]) {
        if (!item || typeof item.name !== 'string') continue;

        const isObject = typeof item.type === 'string' && item.type.startsWith('object');
        const nested = isObject && Array.isArray(item.value);

        let value: string | number | boolean;
        if (nested) {
            value = CONTAINER_VALUE;
        } else if (
            typeof item.value === 'string' ||
            typeof item.value === 'number' ||
            typeof item.value === 'boolean'
        ) {
            value = item.value;
        } else {
            value = '';
        }

        const defaultValue =
            typeof item.default === 'string' ||
            typeof item.default === 'number' ||
            typeof item.default === 'boolean'
                ? item.default
                : undefined;

        out.push({
            key: item.name,
            type: item.type,
            value,
            // A nested object cannot be edited generically yet.
            readonly: Boolean(item.readonly) || nested,
            hasdefault: Boolean(item.hasdefault),
            isdefault: item.hasdefault ? Boolean(item.isdefault) : false,
            defaultValue,
            enumdef: item.type === 'enum' && Array.isArray(item.enumdef)
                ? item.enumdef.map(String)
                : undefined,
            isContainer: nested,
            depth: 0,
        });
    }
    return out;
}
