// Runs in renderer thread. Calls cross to worker via transport.invokeWorker.
import type { ProposeUniqNameArgs, ProposeUniqNameResult } from '../../../worker/server/services/proposeUniqName.service';
import type { CreateViewInSceneArgs, CreateViewInSceneResult } from '../../../worker/server/services/createViewInScene.service';
import type { ProposeNewTabNamesArgs, ProposeNewTabNamesResult } from '../../../worker/server/services/proposeNewTabNames.service';
import type { GetSceneCloseInfoArgs, GetSceneCloseInfoResult } from '../../../worker/server/services/getSceneCloseInfo.service';
import { WorkerTransport } from '../WorkerTransport';
import type { SceneBgColor, ViewCenterMark } from '../../../../shared/ipcTypes';

export async function getViewProjection(
    transport: WorkerTransport, viewId: number,
): Promise<{ ok: boolean; perspective: boolean } | null> {
    const result = await transport.invokeWorker('getViewProjection', { viewId });
    return result?.[0] ?? null;
}

export async function setViewProjection(
    transport: WorkerTransport, viewId: number, perspective: boolean,
): Promise<{ ok: boolean; perspective: boolean } | null> {
    const result = await transport.invokeWorker('setViewProjection', { viewId, perspective });
    return result?.[0] ?? null;
}

export async function getViewCenterMark(
    transport: WorkerTransport, viewId: number,
): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
    const result = await transport.invokeWorker('getViewCenterMark', { viewId });
    return result?.[0] ?? null;
}

export async function setViewCenterMark(
    transport: WorkerTransport, viewId: number, centerMark: ViewCenterMark,
): Promise<{ ok: boolean; centerMark: ViewCenterMark } | null> {
    const result = await transport.invokeWorker('setViewCenterMark', { viewId, centerMark });
    return result?.[0] ?? null;
}

export async function getSceneBgColor(
    transport: WorkerTransport, sceneId: number,
): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
    const result = await transport.invokeWorker('getSceneBgColor', { sceneId });
    return result?.[0] ?? null;
}

export async function setSceneBgColor(
    transport: WorkerTransport, sceneId: number, colorName: 'white' | 'black',
): Promise<{ ok: boolean; bgColor: SceneBgColor } | null> {
    const result = await transport.invokeWorker('setSceneBgColor', { sceneId, colorName });
    return result?.[0] ?? null;
}

export async function proposeUniqName(
    transport: WorkerTransport, args: ProposeUniqNameArgs,
): Promise<ProposeUniqNameResult | null> {
    const result = await transport.invokeWorker('proposeUniqName', args);
    return result?.[0] ?? null;
}

export async function createViewInScene(
    transport: WorkerTransport, args: CreateViewInSceneArgs,
): Promise<CreateViewInSceneResult | null> {
    const result = await transport.invokeWorker('createViewInScene', args);
    return result?.[0] ?? null;
}

export async function proposeNewTabNames(
    transport: WorkerTransport, args: ProposeNewTabNamesArgs,
): Promise<ProposeNewTabNamesResult | null> {
    const result = await transport.invokeWorker('proposeNewTabNames', args);
    return result?.[0] ?? null;
}

export async function getSceneCloseInfo(
    transport: WorkerTransport, args: GetSceneCloseInfoArgs,
): Promise<GetSceneCloseInfoResult | null> {
    const result = await transport.invokeWorker('getSceneCloseInfo', args);
    return result?.[0] ?? null;
}
