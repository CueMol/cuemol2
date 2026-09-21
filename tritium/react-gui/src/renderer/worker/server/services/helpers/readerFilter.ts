/**
 * @file worker/server/services/helpers/readerFilter.ts
 * @description Shared predicates over reader / writer nicknames, for the two
 * kinds of handler that must not be offered to the user as an ordinary file to
 * open: internal QDF handlers, and the trajectory-block readers.
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

/**
 * Obj-reader nicknames whose `createDefaultObj()` returns an `mdtools::TrajBlock`
 * rather than a renderable object.
 *
 * These are real, working readers -- they are how a `.dcd` / `.xtc` / `.trr` /
 * AMBER NetCDF file is read -- but a TrajBlock is a bag of coordinate frames
 * with no renderer registered against it, so it cannot be opened on its own.
 * It only becomes displayable once a topology file has built a `Trajectory`
 * for it to attach to, which is what the MD Tools plugin's
 * "Open MD Trajectory..." flow does.
 *
 * They are therefore kept out of the File > Open filter list, but deliberately
 * left in the reader-inference path: the open flow needs to recognise the file
 * in order to say what it actually is (see `getCompatibleRendererNames`, whose
 * `objType` is the runtime source of truth, and `useSceneCommands`' error
 * branch). Hiding them from inference too would make a dropped `.xtc` report
 * "no reader accepts this file", which is just as untrue as the message this
 * list exists to prevent.
 */
const TRAJ_BLOCK_OBJ_READERS: ReadonlySet<string> = new Set([
    'dcdtraj',
    'trrtraj',
    'xtctraj',
    'ambnetcdftraj',
]);

/**
 * True when `name` is an obj reader that produces a TrajBlock, i.e. a
 * trajectory data file that cannot be opened by itself.
 *
 * This is a static list because the filter list is built from reader metadata
 * alone (nickname / description / extension); instantiating every registered
 * reader just to look at its default object would be a heavy price for a
 * dialog that opens on every File > Open. Where a live object is already at
 * hand, prefer testing `objType === 'TrajBlock'` instead.
 */
export function isTrajBlockObjReader(name: string): boolean {
    return TRAJ_BLOCK_OBJ_READERS.has(name);
}
