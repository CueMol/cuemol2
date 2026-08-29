// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { SceneBgColor } from '@shared/types/menuState';
import type { WorkerContext } from '../types/WorkerContext';
import { makeColor } from './helpers/makeColor';
import { withUndoTxn } from './withUndoTxn';
import { getSceneOrNull } from './helpers/sceneResolver';

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
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, bgColor: 'other' };
    const color = scene.bgcolor;
    return { ok: true, bgColor: classifyBgColor(color.r(), color.g(), color.b()) };
}

function setSceneBgColor(ctx: WorkerContext, args: SetSceneBgColorArgs): SceneBgColorResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, bgColor: 'other' };
    withUndoTxn(scene, 'Set background color', () => {
        scene.bgcolor = makeColor(ctx, args.colorName, scene.uid);
    });
    return { ok: true, bgColor: args.colorName };
}

// --- Color proofing (Phase: ctxmenu.scene) ---
//
// Mirrors UXP `Qm2Main.onToggleColProof` / `onSceneMenuShowing`. The
// "checked" state for the menu item is the combined gate of both flags:
//   use_colproof === true && icc_filename !== ""
// Toggling on sets a default CMYK profile when none is configured;
// toggling off only flips use_colproof, preserving icc_filename so the
// next toggle-on reuses the user's configured profile.

export interface SceneColorProofingArgs {
    sceneId: number;
}

export interface SceneColorProofingResult {
    ok: boolean;
    /** Combined gate matching UXP menu check display. */
    enabled: boolean;
}

const DEFAULT_ICC_PROFILE = 'GenericCMYK.icm';

function isColorProofingActive(scene: Scene): boolean {
    return scene.use_colproof === true && scene.icc_filename !== '';
}

function getSceneColorProofing(
    ctx: WorkerContext,
    args: SceneColorProofingArgs,
): SceneColorProofingResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, enabled: false };
    return { ok: true, enabled: isColorProofingActive(scene) };
}

function toggleSceneColorProofing(
    ctx: WorkerContext,
    args: SceneColorProofingArgs,
): SceneColorProofingResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, enabled: false };

    withUndoTxn(scene, 'Toggle color proofing', () => {
        if (isColorProofingActive(scene)) {
            scene.use_colproof = false;
        } else {
            scene.use_colproof = true;
            if (scene.icc_filename === '') {
                scene.icc_filename = DEFAULT_ICC_PROFILE;
            }
        }
    });
    return { ok: true, enabled: isColorProofingActive(scene) };
}

export const services = {
    getSceneBgColor,
    setSceneBgColor,
    getSceneColorProofing,
    toggleSceneColorProofing,
};
