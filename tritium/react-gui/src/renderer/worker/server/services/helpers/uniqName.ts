/**
 * @file worker/server/services/helpers/uniqName.ts
 * @description Unique-name picker shared by services that create new scene
 * objects (mol surface, symm-mol copy, ...).
 */

/**
 * Pick the first available name from the sequence `${prefix}`, `${prefix}(1)`,
 * `${prefix}(2)`, ... -- matches UXP `util.makeUniqName2`.
 *
 * @param prefix - Base name to try first.
 * @param exists - Predicate returning true when a candidate is already taken.
 * @returns The first free candidate (falls back to `prefix` after 10000 tries).
 */
export function uniqName(prefix: string, exists: (name: string) => boolean): string {
    if (!exists(prefix)) return prefix;
    for (let i = 1; i < 10000; i++) {
        const candidate = `${prefix}(${i})`;
        if (!exists(candidate)) return candidate;
    }
    return prefix;
}
