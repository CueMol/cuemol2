/**
 * Run a read thunk and swallow any thrown error, returning `undefined` instead.
 *
 * Used by worker services to probe native getters that may throw (for example
 * when a scene/object/property is missing) without wrapping every call site in
 * its own try/catch. The fallback contract here is strictly `T | undefined` --
 * callers that need a typed fallback (empty string / 0 / false) must use the
 * typed-coercion readers instead (see animResolve.ts safeNum/safeStr/safeBool),
 * which intentionally have a different contract.
 *
 * @param read - thunk that performs the read and may throw
 * @returns the read value, or `undefined` if the thunk threw
 */
export function safeRead<T>(read: () => T): T | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}
