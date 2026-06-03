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
// Nested object properties ARE recursed into: a non-string-convertible
// `object<...>` property emits a container row (`<node>`, read-only) followed
// by its children with dot-path keys (`section.type`, `section.width`, ...) and
// an incremented `depth`. Those dot-path keys are writable: the C++
// `cuemol2::setProp` / `resetProp` (src/libcuemol2_api/binding.cpp) route through
// `LPropSupport::setNestedProperty` / `resetNestedProperty`, which split on `.`,
// walk into the child object, and set/reset the leaf property. The top-level
// object property staying read-only only means the object itself cannot be
// replaced wholesale; its sub-properties remain editable through the dot-path.

/** Placeholder value shown for a non-string-convertible nested object. */
export const CONTAINER_VALUE = '<node>';

/** A single property row consumed by the generic property inspector. */
export interface GenericPropEntry {
    /** Property name; dot-path (`section.width`) for a nested object's child. */
    key: string;
    /** C++ type tag: boolean|integer|real|string|enum|object<...>. */
    type: string;
    /** Current value; `<node>` for a nested-object container row. */
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
    /** True for a non-string-convertible nested object (the container row). */
    isContainer: boolean;
    /** Dot-nesting depth (0 = top-level, 1 = direct child of an object, ...). */
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

/** True for a `string | number | boolean` scalar. */
function isScalar(v: unknown): v is string | number | boolean {
    return (
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );
}

/**
 * Walk a raw `getPropsJSON()` array into inspector rows, recursing into nested
 * object properties.
 *
 * @param raw - the raw property array (top-level array, or a nested object's
 *   `value` array)
 * @param prefix - dot-path prefix for nested children (empty at top level)
 * @param depth - nesting depth of this level (0 at top level)
 * @param out - accumulator the rows are pushed onto
 */
function walk(
    raw: RawPropItem[],
    prefix: string,
    depth: number,
    out: GenericPropEntry[],
): void {
    for (const item of raw) {
        if (!item || typeof item.name !== 'string') continue;

        const key = prefix ? `${prefix}.${item.name}` : item.name;
        const isObject =
            typeof item.type === 'string' && item.type.startsWith('object');
        const nested = isObject && Array.isArray(item.value);

        const value: string | number | boolean = nested
            ? CONTAINER_VALUE
            : isScalar(item.value)
              ? item.value
              : '';

        const defaultValue = isScalar(item.default) ? item.default : undefined;

        out.push({
            key,
            type: item.type,
            value,
            // A container object cannot be replaced wholesale (its children are
            // still editable via dot-path); other rows honour their own flag.
            readonly: Boolean(item.readonly) || nested,
            hasdefault: Boolean(item.hasdefault),
            isdefault: item.hasdefault ? Boolean(item.isdefault) : false,
            defaultValue,
            enumdef:
                item.type === 'enum' && Array.isArray(item.enumdef)
                    ? item.enumdef.map(String)
                    : undefined,
            isContainer: nested,
            depth,
        });

        if (nested) {
            walk(item.value as RawPropItem[], key, depth + 1, out);
        }
    }
}

/**
 * Convert a parsed `getPropsJSON()` array into inspector rows.
 *
 * @param raw - the array returned by `JSON.parse(target.getPropsJSON())`
 */
export function parseGenericProps(raw: unknown): GenericPropEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: GenericPropEntry[] = [];
    walk(raw as RawPropItem[], '', 0, out);
    return out;
}
