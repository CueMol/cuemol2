/**
 * @file worker/server/services/props/props.service.ts
 * @description The generic property inspector's four calls.
 *
 * Every scene-tree node answers `getPropsJSON()`, so the Generic tab can show
 * any of them without knowing what it is. Reading is one call; writing is
 * three, because a write can be one property, several in one undo step, or a
 * reset back to the defaults.
 *
 * UXP parity: `propeditor-generic-page` / `commitPropChange`.
 */
import { getGenericProps } from './read';
import { setGenericProp, setGenericProps, resetGenericProps } from './write';
export const services = {
    getGenericProps,
    setGenericProp,
    resetGenericProps,
    setGenericProps,
};

export type * from './types';
