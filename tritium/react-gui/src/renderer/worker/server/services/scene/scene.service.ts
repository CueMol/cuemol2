/**
 * @file worker/server/services/scene/scene.service.ts
 * @description Scenes and views: the registry entry.
 *
 * Creating a scene and its view, naming them, reporting what a close would
 * discard, listing what a scene holds, and exporting an image of it.
 */

import { createNewSceneAndView } from './createNewSceneAndView';
import { createViewInScene } from './createViewInScene';
import { exportScene, getAvailableSceneExporters, getSceneExportInfo } from './exportImage';
import { getSceneCloseInfo } from './getSceneCloseInfo';
import { getViewTabLabel } from './getViewTabLabel';
import { isSceneJustCreated } from './isSceneJustCreated';
import { listSceneObjects } from './listSceneObjects';
import { proposeNewTabNames } from './proposeNewTabNames';
import { proposeUniqName } from './proposeUniqName';
import { getSceneSaveInfo, saveScene } from './saveScene';
import { getSceneBgColor, getSceneColorProofing, setSceneBgColor, toggleSceneColorProofing } from './sceneBgColor';

export const services = {
    createNewSceneAndView,
    createViewInScene,
    exportScene,
    getSceneExportInfo,
    getAvailableSceneExporters,
    getSceneCloseInfo,
    getViewTabLabel,
    isSceneJustCreated,
    listSceneObjects,
    proposeNewTabNames,
    proposeUniqName,
    getSceneSaveInfo,
    saveScene,
    getSceneBgColor,
    setSceneBgColor,
    getSceneColorProofing,
    toggleSceneColorProofing,
};

export type * from './createNewSceneAndView';
export type * from './createViewInScene';
export type * from './exportImage';
export type * from './getSceneCloseInfo';
export type * from './getViewTabLabel';
export type * from './isSceneJustCreated';
export type * from './listSceneObjects';
export type * from './proposeNewTabNames';
export type * from './proposeUniqName';
export type * from './saveScene';
export type * from './sceneBgColor';
