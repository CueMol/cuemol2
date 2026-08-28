/**
 * @file renderer/worker/shared/uid.ts
 * @description The C++ uid sentinel.
 *
 * `qlib::invalid_uid` is **0**, not a negative number (src/qlib/qlib.hpp).
 * Several worker services guarded lookups with `if (uid < 0)`, which is never
 * true, so a "not found" result fell through as if it were a real uid:
 * saveStyleSetToFile(0, 0, path) logged "styleset (0) not found" and returned
 * false, and saveSelDef wrote named selections into style-set id 0.
 */

/** The value C++ returns for "no such object". */
export const INVALID_UID = 0;

/**
 * Whether a uid returned by a C++ lookup refers to a real object.
 *
 * Accepts only strictly positive values: 0 is the sentinel, and a real uid is
 * never negative (see the "IDs are not URLs" note in tritium/CLAUDE.md), so a
 * negative value can only mean a stub or a bug and is not a usable id either.
 */
export function isValidUid(uid: number | null | undefined): boolean {
    return typeof uid === 'number' && Number.isFinite(uid) && uid > INVALID_UID;
}
