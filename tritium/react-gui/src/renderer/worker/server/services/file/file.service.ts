/**
 * @file worker/server/services/file/file.service.ts
 * @description Reading and writing files: the registry entry.
 *
 * Everything that crosses the filesystem boundary for a scene: opening an
 * object or a scene, streaming one from a URL, saving one back, and the
 * questions the File Open dialog asks first (which readers apply, what their
 * defaults are).
 */

import { getCompatibleRendererNames } from './getCompatibleRendererNames';
import { getOpenFilters } from './getOpenFilters';
import { getReaderDefaultOptions } from './getReaderDefaultOptions';
import { loadObject } from './loadObject';
import { loadScene, openSceneFile } from './loadScene';
import { loadTrajectory } from './loadTrajectory';
import { getObjectSaveInfo, listSavableObjects, saveObjectToFile } from './objectSave';
import { cancelStreamLoad, streamLoadFromUrl } from './streamLoadFromUrl';

export const services = {
    getCompatibleRendererNames,
    getOpenFilters,
    getReaderDefaultOptions,
    loadObject,
    loadScene,
    openSceneFile,
    loadTrajectory,
    getObjectSaveInfo,
    saveObjectToFile,
    listSavableObjects,
    streamLoadFromUrl,
    cancelStreamLoad,
};

export type * from './getCompatibleRendererNames';
export type * from './getOpenFilters';
export type * from './getReaderDefaultOptions';
export type * from './loadObject';
export type * from './loadScene';
export type * from './loadTrajectory';
export type * from './objectSave';
export type * from './streamLoadFromUrl';
