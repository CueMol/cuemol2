// Runs in renderer thread. Calls cross to worker via transport.invokeService.
import type { ProposeUniqNameArgs, ProposeUniqNameResult } from '../../server/services/proposeUniqName.service';
import type { CreateViewInSceneArgs, CreateViewInSceneResult } from '../../server/services/createViewInScene.service';
import type { ProposeNewTabNamesArgs, ProposeNewTabNamesResult } from '../../server/services/proposeNewTabNames.service';
import type { GetSceneCloseInfoArgs, GetSceneCloseInfoResult } from '../../server/services/getSceneCloseInfo.service';
import { WorkerTransport } from '../WorkerTransport';
import type { SceneBgColor, ViewCenterMark } from '../../../../shared/ipcTypes';

export async function getViewProjection(
    transport: WorkerTransport, viewId: number,
): Promise<{ ok: boolean; perspective: boolean } | null> {
    return await transport.invokeService('getViewProjection', { viewId });
}

export async function setViewProjection(
    transport: WorkerTransport, viewId: number, perspective: boolean,
): Promise<{ ok: boolean; perspective: boolean } | null> {
    return await transport.invokeService('setViewProjection', { viewId, perspective });
}

export async function getViewCenterMark(
    transport: WorkerTransport, viewId: number,
): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
    return await transport.invokeService('getViewCenterMark', { viewId });
}

export async function setViewCenterMark(
    transport: WorkerTransport, viewId: number, centerMark: ViewCenterMark,
): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
    return await transport.invokeService('setViewCenterMark', { viewId, centerMark });
}

export async function getSceneBgColor(
    transport: WorkerTransport, sceneId: number,
): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
    return await transport.invokeService('getSceneBgColor', { sceneId });
}

export async function setSceneBgColor(
    transport: WorkerTransport, sceneId: number, colorName: 'white' | 'black',
): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
    return await transport.invokeService('setSceneBgColor', { sceneId, colorName });
}

export async function proposeUniqName(
    transport: WorkerTransport, args: ProposeUniqNameArgs,
): Promise<ProposeUniqNameResult | null> {
    return await transport.invokeService('proposeUniqName', args);
}

export async function createViewInScene(
    transport: WorkerTransport, args: CreateViewInSceneArgs,
): Promise<CreateViewInSceneResult | null> {
    return await transport.invokeService('createViewInScene', args);
}

export async function proposeNewTabNames(
    transport: WorkerTransport, args: ProposeNewTabNamesArgs,
): Promise<ProposeNewTabNamesResult | null> {
    return await transport.invokeService('proposeNewTabNames', args);
}

export async function getSceneCloseInfo(
    transport: WorkerTransport, args: GetSceneCloseInfoArgs,
): Promise<GetSceneCloseInfoResult | null> {
    return await transport.invokeService('getSceneCloseInfo', args);
}
