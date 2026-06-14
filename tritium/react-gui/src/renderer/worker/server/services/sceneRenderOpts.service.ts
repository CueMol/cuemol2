/**
 * @file services/sceneRenderOpts.service.ts
 * @description Read/write of a scene's rendering & display properties for the
 * Rendering pane (`RenderingPane`): ambient occlusion (GTAO), post-process
 * anti-aliasing, background colour, and CMYK colour proofing. Supersedes the
 * temporary devtools-only `devRenderOpts.service.ts` console affordance.
 *
 * Runs in the Web Worker thread (C++ wrappers are synchronous, no await).
 *
 * Every C++ setter calls `setUpdateFlag()`, so the RAF render loop redraws
 * automatically -- changes are live-previewed with no explicit redraw.
 *
 * Undo model: a discrete change (toggle / select / colour / text) commits as a
 * single undo step via `withUndoTxn`. A slider drag spans several frames, so it
 * is bracketed explicitly -- `begin` opens an undo txn, `live` frames mutate
 * inside it, and `end` commits (or `cancel` rolls back) -- collapsing the whole
 * drag into one undo step. The `mode` arg selects which path runs.
 *
 * Enum `.qif` properties (`aa_method`, `icc_intent`) are typed as `number` in
 * the generated wrapper but accept/return their string id at runtime, so they
 * are cast at the boundary.
 */
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '../types/WorkerContext';
import { getSceneOrNull } from './helpers/sceneResolver';
import { makeColor } from './helpers/makeColor';
import { withUndoTxn } from './withUndoTxn';

export type AaMethodName = 'none' | 'fxaa' | 'smaa';
export type IccIntentName =
    | 'perceptual'
    | 'relative_colorimetric'
    | 'saturation'
    | 'absolute_colorimetric';

/** Full mutable rendering/display state surfaced by the Rendering pane. */
export interface SceneRenderOptsState {
    aoEnabled: boolean;
    aoRadius: number;
    aoIntensity: number;
    aoSlices: number;
    aoSteps: number;
    aoHalfRes: boolean;
    aaMethod: AaMethodName;
    aaJitterLevel: number;
    /** Background colour as a `#rrggbb` hex string. */
    bgColor: string;
    useColProof: boolean;
    iccFilename: string;
    iccIntent: IccIntentName;
}

export interface GetSceneRenderOptsArgs {
    sceneId: number;
}

/** Undo-bracketing for a set: discrete `single`, or `begin`/`live`/`end`/`cancel` for a drag. */
export type SceneRenderOptsMode = 'single' | 'begin' | 'live' | 'end' | 'cancel';

export interface SetSceneRenderOptsArgs {
    sceneId: number;
    /** Fields to write; omitted fields are left untouched. */
    patch?: Partial<SceneRenderOptsState>;
    /** Undo bracketing (default `single`). */
    mode?: SceneRenderOptsMode;
    /** Undo step label (used by `single` / `begin`). */
    label?: string;
}

export interface SceneRenderOptsResult extends SceneRenderOptsState {
    ok: boolean;
}

const EMPTY_STATE: SceneRenderOptsState = {
    aoEnabled: false,
    aoRadius: 0,
    aoIntensity: 0,
    aoSlices: 0,
    aoSteps: 0,
    aoHalfRes: false,
    aaMethod: 'none',
    aaJitterLevel: 0,
    bgColor: '#000000',
    useColProof: false,
    iccFilename: '',
    iccIntent: 'perceptual',
};

function toHex2(v: number): string {
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

/** `#rrggbb` from the scene's background colour (r/g/b are 0-255). */
function bgColorHex(scene: Scene): string {
    const c = scene.bgcolor;
    return `#${toHex2(c.r())}${toHex2(c.g())}${toHex2(c.b())}`;
}

function readState(scene: Scene): SceneRenderOptsState {
    return {
        aoEnabled: scene.aoEnabled,
        aoRadius: scene.aoRadius,
        aoIntensity: scene.aoIntensity,
        aoSlices: scene.aoSlices,
        aoSteps: scene.aoSteps,
        aoHalfRes: scene.aoHalfRes,
        aaMethod: scene.aa_method as unknown as AaMethodName,
        aaJitterLevel: scene.aaJitterLevel,
        bgColor: bgColorHex(scene),
        useColProof: scene.use_colproof,
        iccFilename: scene.icc_filename,
        iccIntent: scene.icc_intent as unknown as IccIntentName,
    };
}

/** Write only the fields present in `patch` (enum/colour conversions inline). */
function applyPatch(
    ctx: WorkerContext,
    scene: Scene,
    patch: Partial<SceneRenderOptsState>,
): void {
    if (patch.aoEnabled !== undefined) scene.aoEnabled = patch.aoEnabled;
    if (patch.aoRadius !== undefined) scene.aoRadius = patch.aoRadius;
    if (patch.aoIntensity !== undefined) scene.aoIntensity = patch.aoIntensity;
    if (patch.aoSlices !== undefined) scene.aoSlices = patch.aoSlices;
    if (patch.aoSteps !== undefined) scene.aoSteps = patch.aoSteps;
    if (patch.aoHalfRes !== undefined) scene.aoHalfRes = patch.aoHalfRes;
    // enum properties accept their string id at runtime (typed as number).
    if (patch.aaMethod !== undefined) scene.aa_method = patch.aaMethod as unknown as number;
    if (patch.aaJitterLevel !== undefined) scene.aaJitterLevel = patch.aaJitterLevel;
    if (patch.bgColor !== undefined) scene.bgcolor = makeColor(ctx, patch.bgColor, scene.uid);
    if (patch.useColProof !== undefined) scene.use_colproof = patch.useColProof;
    if (patch.iccFilename !== undefined) scene.icc_filename = patch.iccFilename;
    if (patch.iccIntent !== undefined) scene.icc_intent = patch.iccIntent as unknown as number;
}

function getSceneRenderOpts(
    ctx: WorkerContext,
    args: GetSceneRenderOptsArgs,
): SceneRenderOptsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, ...EMPTY_STATE };
    return { ok: true, ...readState(scene) };
}

function setSceneRenderOpts(
    ctx: WorkerContext,
    args: SetSceneRenderOptsArgs,
): SceneRenderOptsResult {
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return { ok: false, ...EMPTY_STATE };

    const mode = args.mode ?? 'single';
    const patch = args.patch ?? {};
    const label = args.label ?? 'Scene rendering';

    switch (mode) {
        case 'single':
            withUndoTxn(scene, label, () => applyPatch(ctx, scene, patch));
            break;
        case 'begin':
            scene.startUndoTxn(label);
            applyPatch(ctx, scene, patch);
            break;
        case 'live':
            applyPatch(ctx, scene, patch);
            break;
        case 'end':
            applyPatch(ctx, scene, patch);
            scene.commitUndoTxn();
            break;
        case 'cancel':
            scene.rollbackUndoTxn();
            break;
    }

    return { ok: true, ...readState(scene) };
}

export const services = { getSceneRenderOpts, setSceneRenderOpts };
