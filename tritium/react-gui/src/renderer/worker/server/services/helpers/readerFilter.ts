/**
 * @file worker/server/services/helpers/readerFilter.ts
 * @description Shared predicates for hiding internal QDF handlers from the GUI.
 *
 * QDF handlers (`qdf*`) read and write the cuemol2 QDF/qsc internal storage
 * format, which is not a user-facing file format.
 *
 * On the read side (`qdfpdb` and friends) they must be excluded from both the
 * file-open dialog filter list and the reader-inference (content sniff /
 * extension) path -- otherwise a `qdf*` reader can win a content sniff over
 * the intended user-facing reader (e.g. `qdfpdb` over `pdb`).
 *
 * On the write side they are excluded from the object save-as filter list.
 * Note this is a deliberate deviation from UXP, whose `makeFilter` applies the
 * QDF rule to readers only. It also means objects whose only writer is a
 * `qdf*` one (DensityMap, MolSurfObj, ElePotMap, LWObject) have no writer left
 * and are therefore not offered for save at all -- see ADR-0014.
 */

/**
 * True when `name` is an internal handler nickname that must not be offered to
 * or chosen for the user (currently the `qdf*` family).
 */
function isHiddenHandler(name: string): boolean {
    return name.indexOf('qdf') === 0;
}

/** Read-side spelling of {@link isHiddenHandler}. */
export function isHiddenObjReader(name: string): boolean {
    return isHiddenHandler(name);
}

/** Write-side spelling of {@link isHiddenHandler}. */
export function isHiddenObjWriter(name: string): boolean {
    return isHiddenHandler(name);
}
