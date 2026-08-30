/**
 * @file worker/server/services/view/view.service.ts
 * @description Views: the registry entry.
 *
 * A view is a camera onto a scene plus how the user drives it: the
 * projection, the transform, the input parameters, and the label defaults
 * that new labels inherit.
 */

import { getLabelDefaults, setLabelDefaults } from './labelDefaults';
import { getViewInputParams, setViewInputParams } from './viewInputParams';
import { getViewCenterMark, getViewProjection, setViewCenterMark, setViewProjection } from './viewProjection';
import { getViewXform, rotateView, setViewXform, translateView } from './viewXform';

export const services = {
    getLabelDefaults,
    setLabelDefaults,
    getViewInputParams,
    setViewInputParams,
    getViewProjection,
    setViewProjection,
    getViewCenterMark,
    setViewCenterMark,
    getViewXform,
    setViewXform,
    rotateView,
    translateView,
};

export type * from './labelDefaults';
export type * from './viewInputParams';
export type * from './viewProjection';
export type * from './viewXform';
