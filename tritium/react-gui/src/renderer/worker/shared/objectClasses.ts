/**
 * @file worker/shared/objectClasses.ts
 * @description What kind of thing a scene object is, by its C++ class name.
 *
 * Both threads ask the same two questions about a loaded object and used to
 * answer them differently. The worker knew the class name and tested it
 * (`setupRenderer`, `getNewRendererOptions`); the File Open dialog had only
 * the reader nickname and guessed from that, which mislabelled every density
 * map reader outside `ccp4map` / `mtzmap` -- `brix`, `mmcifmap`, `qdfmap` and
 * `xplormap` all fell through to "unknown" and were treated as molecules, so
 * the dialog offered an atom selection for a map. The class name is what the
 * C++ side actually reports (`getCompatibleRendererNames` returns it as
 * `objType`), so both threads read it from here.
 *
 * UXP asked the same question with `cuemol.implIface(obj_type, "MolCoord")` /
 * `implIface(..., "DensityMap")`; there is no interface bridge in tritium, so
 * these are the concrete classes those interfaces resolved to.
 */

/** Object classes that carry no atoms: an atom selection is meaningless. */
export const NON_MOL_CLASSES: readonly string[] = [
    'ElePotMap',
    'MolSurfObj',
    'DensityMap',
];

/** Scalar (volume) objects, which a map renderer draws. */
export const SCALAR_MAP_CLASSES: readonly string[] = ['DensityMap', 'ElePotMap'];

/**
 * True when atoms -- and therefore an atom selection -- apply to this class.
 *
 * An unknown / empty class name counts as a molecule: that is the historical
 * default, and dropping the Selection field for something we failed to
 * identify would hide a control the user needs.
 */
export function isMolObjectClass(className: string): boolean {
    return !NON_MOL_CLASSES.includes(className);
}

/** True for a volume object, whose view options are the map ones. */
export function isScalarMapClass(className: string): boolean {
    return SCALAR_MAP_CLASSES.includes(className);
}
