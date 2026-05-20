/**
 * @file renderer/worker/client/apis/sceneViewApi.ts
 * @description Renderer-thread thin wrappers for worker scene / view
 * settings services (projection, center mark, background color, unique
 * name proposal, multi-view, scene-close info).
 *
 * Each function returns the worker reply or `null` on transport failure.
 */
import type { ProposeUniqNameArgs, ProposeUniqNameResult } from '../../server/services/proposeUniqName.service';
import type { CreateViewInSceneArgs, CreateViewInSceneResult } from '../../server/services/createViewInScene.service';
import type { ProposeNewTabNamesArgs, ProposeNewTabNamesResult } from '../../server/services/proposeNewTabNames.service';
import type { GetSceneCloseInfoArgs, GetSceneCloseInfoResult } from '../../server/services/getSceneCloseInfo.service';
import { WorkerTransport } from '../WorkerTransport';
import type { SceneBgColor, ViewCenterMark } from '../../../../shared/ipcTypes';

/**
 * Read the projection mode (perspective vs. orthographic) of a view.
 *
 * @param transport - Worker transport.
 * @param viewId - Target view uid.
 * @remarks Calls `getViewProjection` worker service.
 */
export async function getViewProjection(
    transport: WorkerTransport, viewId: number,
): Promise<{ ok: boolean; perspective: boolean } | null> {
    return await transport.invokeService('getViewProjection', { viewId });
}

/**
 * Change the projection mode of a view.
 *
 * @param transport - Worker transport.
 * @param viewId - Target view uid.
 * @param perspective - `true` for perspective, `false` for orthographic.
 * @remarks Calls `setViewProjection` worker service.
 */
export async function setViewProjection(
    transport: WorkerTransport, viewId: number, perspective: boolean,
): Promise<{ ok: boolean; perspective: boolean } | null> {
    return await transport.invokeService('setViewProjection', { viewId, perspective });
}

/**
 * Read the view-center mark display style.
 *
 * @param transport - Worker transport.
 * @param viewId - Target view uid.
 * @remarks Calls `getViewCenterMark` worker service.
 */
export async function getViewCenterMark(
    transport: WorkerTransport, viewId: number,
): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
    return await transport.invokeService('getViewCenterMark', { viewId });
}

/**
 * Change the view-center mark display style.
 *
 * @param transport - Worker transport.
 * @param viewId - Target view uid.
 * @param centerMark - Mark style enum.
 * @remarks Calls `setViewCenterMark` worker service.
 */
export async function setViewCenterMark(
    transport: WorkerTransport, viewId: number, centerMark: ViewCenterMark,
): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
    return await transport.invokeService('setViewCenterMark', { viewId, centerMark });
}

/**
 * Read the background color of a scene.
 *
 * @param transport - Worker transport.
 * @param sceneId - Target scene uid.
 * @remarks Calls `getSceneBgColor` worker service.
 */
export async function getSceneBgColor(
    transport: WorkerTransport, sceneId: number,
): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
    return await transport.invokeService('getSceneBgColor', { sceneId });
}

/**
 * Set the background color of a scene to one of the preset names.
 *
 * @param transport - Worker transport.
 * @param sceneId - Target scene uid.
 * @param colorName - `'white'` or `'black'`.
 * @remarks Calls `setSceneBgColor` worker service.
 */
export async function setSceneBgColor(
    transport: WorkerTransport, sceneId: number, colorName: 'white' | 'black',
): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
    return await transport.invokeService('setSceneBgColor', { sceneId, colorName });
}

/**
 * Ask the worker to propose a unique name in a given namespace (scene,
 * object, renderer, ...). Used by rename dialogs to seed an
 * already-available default.
 *
 * @param transport - Worker transport.
 * @param args - Namespace + base name.
 * @remarks Calls `proposeUniqName` worker service.
 */
export async function proposeUniqName(
    transport: WorkerTransport, args: ProposeUniqNameArgs,
): Promise<ProposeUniqNameResult | null> {
    return await transport.invokeService('proposeUniqName', args);
}

/**
 * Create an additional view inside an existing scene (for split / multi
 * view).
 *
 * @param transport - Worker transport.
 * @param args - Scene uid, requested name, and dpr.
 * @remarks Calls `createViewInScene` worker service.
 */
export async function createViewInScene(
    transport: WorkerTransport, args: CreateViewInSceneArgs,
): Promise<CreateViewInSceneResult | null> {
    return await transport.invokeService('createViewInScene', args);
}

/**
 * Compute default tab names for a new-tab dialog (scene name + view
 * name).
 *
 * @param transport - Worker transport.
 * @param args - Optional base hints.
 * @remarks Calls `proposeNewTabNames` worker service.
 */
export async function proposeNewTabNames(
    transport: WorkerTransport, args: ProposeNewTabNamesArgs,
): Promise<ProposeNewTabNamesResult | null> {
    return await transport.invokeService('proposeNewTabNames', args);
}

/**
 * Ask the worker whether closing a view requires a save-changes prompt
 * (whether the scene is dirty, whether other views still reference it).
 *
 * @param transport - Worker transport.
 * @param args - `{ viewId }`.
 * @remarks Calls `getSceneCloseInfo` worker service.
 */
export async function getSceneCloseInfo(
    transport: WorkerTransport, args: GetSceneCloseInfoArgs,
): Promise<GetSceneCloseInfoResult | null> {
    return await transport.invokeService('getSceneCloseInfo', args);
}
