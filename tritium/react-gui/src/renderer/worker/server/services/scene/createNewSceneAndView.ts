// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { NewSceneInitialProps } from '@renderer/worker/shared/newSceneTypes';
import { createInitialView } from '@renderer/worker/server/services/helpers/createSceneView';
import { makeColor } from '@renderer/worker/server/services/helpers/makeColor';
import { DEFAULT_ICC_PROFILE } from './sceneBgColor';

const log = console;

export interface CreateNewSceneAndViewArgs {
    dpr: number;
    name?: string;
    // Whether to register the new view with GfxManager via addView().
    // Defaults to true. Set to false for the initial app-launch scene whose
    // view is attached to the canvas by MolViewPane via bindCanvas() instead;
    // calling addView() before bindCanvas() throws ("not bound to canvas").
    bindView?: boolean;
    /**
     * Scene properties the new scene starts with, in place of the C++
     * defaults (the New Tab dialog's settings, remembered as a preference).
     */
    initialProps?: NewSceneInitialProps;
}

export interface CreateNewSceneAndViewResult {
    scene_uid: number;
    view_uid: number;
    scene_name: string;
    view_name: string;
}

/**
 * The scene properties `applyInitialSceneProps` can write.
 *
 * `loadScene` resets these before reading a file into an existing scene: a
 * property the file leaves out is one that was at its C++ default when the
 * file was written, so the scene has to be back at that default for the read
 * to land on it.
 */
export const INITIAL_SCENE_PROP_KEYS = [
    'aa_method',
    'aaJitterLevel',
    'aoEnabled',
    'aoRadius',
    'aoSteps',
    'aoIntensity',
    'aoHalfRes',
    'bgcolor',
    'use_colproof',
    'icc_filename',
] as const;

/** Whether the scene's colour already equals the requested colour string. */
function bgColorEquals(ctx: WorkerContext, scene: Scene, colorStr: string): boolean {
    try {
        const want = makeColor(ctx, colorStr, scene.uid);
        const have = scene.bgcolor;
        return have.r() === want.r() && have.g() === want.g() && have.b() === want.b();
    } catch {
        return false;
    }
}

/**
 * Apply the caller's scene properties to a scene that has just been created.
 *
 * Deliberately outside an undo transaction: `Scene::isModified()` is driven by
 * the undo stack, so a transaction here would mark an untouched scene modified
 * -- which then prompts to save on close and disqualifies the scene from the
 * in-place `.qsc` load path (`isSceneJustCreated`).
 *
 * A property already holding the requested value is skipped: writing it would
 * clear its "still at the default" flag and make `.qsc` carry an entry that
 * says nothing.
 */
export function applyInitialSceneProps(
    ctx: WorkerContext,
    scene: Scene,
    props: NewSceneInitialProps,
): void {
    const set = <K extends keyof Scene>(key: K, value: Scene[K]): void => {
        if (scene[key] === value) return;
        scene[key] = value;
    };
    try {
        if (props.aa_method !== undefined) {
            // A .qif enum is typed as number but carries a string id at runtime.
            set('aa_method', props.aa_method as unknown as Scene['aa_method']);
        }
        if (props.aaJitterLevel !== undefined) set('aaJitterLevel', props.aaJitterLevel);
        if (props.aoEnabled !== undefined) set('aoEnabled', props.aoEnabled);
        if (props.aoRadius !== undefined) set('aoRadius', props.aoRadius);
        if (props.aoSteps !== undefined) set('aoSteps', props.aoSteps);
        if (props.aoIntensity !== undefined) set('aoIntensity', props.aoIntensity);
        if (props.aoHalfRes !== undefined) set('aoHalfRes', props.aoHalfRes);
        if (props.bgcolor !== undefined && !bgColorEquals(ctx, scene, props.bgcolor)) {
            scene.bgcolor = makeColor(ctx, props.bgcolor, scene.uid);
        }
        if (props.use_colproof !== undefined) {
            set('use_colproof', props.use_colproof);
            // Same contract as `toggleSceneColorProofing`: proofing is only
            // active with a profile, so enabling it seeds the default one.
            if (props.use_colproof && scene.icc_filename === '') {
                scene.icc_filename = DEFAULT_ICC_PROFILE;
            }
        }
    } catch (e) {
        // A scene that exists with default appearance beats no scene at all.
        log.warn('[worker] applyInitialSceneProps failed:', e);
    }
}

/**
 * Put the scene-appearance properties back to their C++ defaults.
 *
 * For the in-place `.qsc` load: the scene being read into may carry the New
 * Scene defaults, and a file that was saved with a property at its default
 * writes no entry for it -- so without this the old value survives the load.
 */
export function resetInitialSceneProps(scene: Scene): void {
    for (const key of INITIAL_SCENE_PROP_KEYS) {
        try {
            scene.resetProp(key);
        } catch (e) {
            log.warn(`[worker] resetInitialSceneProps: could not reset ${key}:`, e);
        }
    }
}

export function createNewSceneAndView(
    ctx: WorkerContext,
    args: CreateNewSceneAndViewArgs
): CreateNewSceneAndViewResult {
    const scene = ctx.sceMgr.createScene();
    if (args.name) {
        scene.setName(args.name);
    }
    if (args.initialProps) {
        applyInitialSceneProps(ctx, scene, args.initialProps);
    }
    const scene_uid = scene.getUID();
    const { view_uid, view_name } = createInitialView(ctx, scene, args.dpr, args.bindView !== false);
    return {
        scene_uid,
        view_uid,
        scene_name: args.name ?? '',
        view_name,
    };
}
