/**
 * @file worker/server/services/style/style.service.ts
 * @description Styles: the registry entry.
 *
 * Style sets are scene-scoped named property bundles. These read and edit
 * them, and move them between a scene and a file.
 */

import { loadStyleSetFromFile, saveStyleSetToCurrentSrc, saveStyleSetToFile } from './styleFile';
import { createStyleSet, destroyStyleSet, toggleStyleSetReadOnly } from './styleOps';
import { getStyleSetContents, removeStyleSetColor, removeStyleSetSelection, removeStyleSetStyle, setStyleSetColor, setStyleSetSelection } from './styleSetEdit';

export const services = {
    loadStyleSetFromFile,
    saveStyleSetToFile,
    saveStyleSetToCurrentSrc,
    createStyleSet,
    destroyStyleSet,
    toggleStyleSetReadOnly,
    getStyleSetContents,
    setStyleSetColor,
    removeStyleSetColor,
    setStyleSetSelection,
    removeStyleSetSelection,
    removeStyleSetStyle,
};

export type * from './styleFile';
export type * from './styleOps';
export type * from './styleSetEdit';
