/**
 * @file worker/server/services/actions/actions.service.ts
 * @description The action log: the registry entry.
 *
 * What each undo step of a scene did, as the ops it ran, for the Action
 * history pane and the step inspector; and the Action library (presets and
 * the user's saved actions) that runs on it.
 */

import { actionStepLines, exportActionSteps, getActionSteps } from './actions';
import {
    canSaveAsMacro,
    copyMacroToLibrary,
    listActionLibrary,
    renameLibraryFile,
    runLibraryEntry,
    saveStepsToLibrary,
} from './library';

export const services = {
    getActionSteps,
    exportActionSteps,
    actionStepLines,
    listActionLibrary,
    runLibraryEntry,
    canSaveAsMacro,
    saveStepsToLibrary,
    copyMacroToLibrary,
    renameLibraryFile,
};

export type * from './actions';
export type * from './library';
