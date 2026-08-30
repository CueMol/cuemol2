/**
 * @file worker/server/services/rend/rend.service.ts
 * @description Renderers: the registry entry.
 *
 * Creating renderers, changing their type, grouping them, and reading the
 * lists the UI offers when it asks the user to pick one. `setupRenderer` is
 * the shared step several of these take -- it is a plain module, not a
 * service.
 */

import { listAtomIntrDefs, removeAtomIntrDefs } from './atomIntrEdit';
import { changeRendererType } from './changeRendererType';
import { createRendererGroup } from './createRendererGroup';
import { createRendererOnObject } from './createRendererOnObject';
import { createStyleFromRenderer, getCreateRendStyleInfo } from './createStyleFromRenderer';
import { generateRendererSurfObj } from './generateRendererSurfObj';
import { getMaterialNames } from './getMaterialNames';
import { getNewRendererOptions, getRendPresetTypes } from './getNewRendererOptions';
import { getRendererChangeTypes } from './getRendererChangeTypes';
import { getSiblingRendererNames } from './getSiblingRendererNames';
import { applyRendererStyle, applyRendererStyleList, getRendererStyleEditInfo, getRendererStyleEntries } from './rendererStyle';
import { setRendererSelection } from './setRendererSelection';

export const services = {
    listAtomIntrDefs,
    removeAtomIntrDefs,
    changeRendererType,
    createRendererGroup,
    createRendererOnObject,
    getCreateRendStyleInfo,
    createStyleFromRenderer,
    generateRendererSurfObj,
    getMaterialNames,
    getNewRendererOptions,
    getRendPresetTypes,
    getRendererChangeTypes,
    getSiblingRendererNames,
    getRendererStyleEntries,
    applyRendererStyle,
    getRendererStyleEditInfo,
    applyRendererStyleList,
    setRendererSelection,
};

export type * from './atomIntrEdit';
export type * from './changeRendererType';
export type * from './createRendererGroup';
export type * from './createRendererOnObject';
export type * from './createStyleFromRenderer';
export type * from './generateRendererSurfObj';
export type * from './getMaterialNames';
export type * from './getNewRendererOptions';
export type * from './getRendererChangeTypes';
export type * from './getSiblingRendererNames';
export type * from './rendererStyle';
export type * from './setRendererSelection';
export type * from './setupRenderer';
