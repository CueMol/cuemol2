import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { SceneBgColor } from '../../../shared/ipcTypes';
import type { WorkerContext } from '../types/WorkerContext';
import { makeColor } from './helpers/makeColor';
import { withUndoTxn } from './withUndoTxn';

export interface SceneBgColorArgs {
    sceneId: number;
}

export interface SetSceneBgColorArgs {
    sceneId: number;
    colorName: 'white' | 'black';
}

export interface SceneBgColorResult {
    ok: boolean;
    bgColor: SceneBgColor;
}

function classifyBgColor(r: number, g: number, b: number): SceneBgColor {
    if (r === 255 && g === 255 && b === 255) return 'white';
    if (r === 0 && g === 0 && b === 0) return 'black';
    return 'other';
}

function getSceneBgColor(ctx: WorkerContext, args: SceneBgColorArgs): SceneBgColorResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false, bgColor: 'other' };
    const color = scene.bgcolor;
    return { ok: true, bgColor: classifyBgColor(color.r(), color.g(), color.b()) };
}

function setSceneBgColor(ctx: WorkerContext, args: SetSceneBgColorArgs): SceneBgColorResult {
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;
    if (!scene) return { ok: false, bgColor: 'other' };
    withUndoTxn(scene, 'Set background color', () => {
        scene.bgcolor = makeColor(ctx, args.colorName, scene.uid);
    });
    return { ok: true, bgColor: args.colorName };
}

export const services = {
    getSceneBgColor,
    setSceneBgColor,
};
