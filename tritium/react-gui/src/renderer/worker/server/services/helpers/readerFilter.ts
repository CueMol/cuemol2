/**
 * @file worker/server/services/helpers/readerFilter.ts
 * @description Shared predicate for hiding internal readers from the GUI.
 *
 * QDF readers (`qdf*`, e.g. `qdfpdb`) deserialize the cuemol2 QDF/qsc internal
 * storage format and are never used to open user files. They must be excluded
 * from both the file-open dialog filter list and the reader-inference
 * (content sniff / extension) path -- otherwise a `qdf*` reader can win a
 * content sniff over the intended user-facing reader (e.g. `qdfpdb` over
 * `pdb`).
 */

/**
 * True when `name` is an internal reader nickname that must not be offered to
 * or chosen for the user (currently the `qdf*` family).
 */
export function isHiddenObjReader(name: string): boolean {
    return name.indexOf('qdf') === 0;
}
