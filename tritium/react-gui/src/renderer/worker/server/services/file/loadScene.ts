// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Same parent-linkage caveat as `loadObject.service.ts`: the
// `cmd.target_scene = scene` wrapper setter would call
// `setPropHelper -> setupParentData("target_scene")` on the command,
// overwriting `scene.m_thisname` to "target_scene" and re-rooting the
// scene under the command. After that, every child property assignment
// under the scene produces a path like "target_scenefoo" with no dot,
// which NestedPropHandler cannot navigate -- undo records stored against
// such paths silently fail. To avoid the corruption we mirror
// `LoadSceneCommand::run()` directly without going through the command
// property setters.

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { SceneXMLReader } from '@cuemol/core/src/wrappers/SceneXMLReader';
import type { View } from '@cuemol/core/src/wrappers/View';
import { matchExtLength, parseExtList } from '@shared/fileExt';
import { fail, failFrom, ok, type Result } from '@renderer/worker/shared/result';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
import { resetInitialSceneProps } from '@renderer/worker/server/services/scene/createNewSceneAndView';
import { createInitialView } from '@renderer/worker/server/services/helpers/createSceneView';

const log = console;

const SCEREADER_CATEGORY = 3; // InOutHandler::IOH_CAT_SCEREADER

/**
 * Extract the leaf (basename) of a path, handling both POSIX and Windows
 * separators. Mirrors UXP `util.getFileLeafName` (`nsIFile.leafName`), which
 * keeps the extension (e.g. "mystruct.qsc"). Same helper as saveScene.
 */
function basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
}

interface StreamHandlerInfo {
    name: string;
    fext: string;
    category: number;
}

/** Mirror `LoadSceneCommand::guessFileFormat(IOH_CAT_SCEREADER)` (3). */
function guessReaderName(ctx: WorkerContext, filePath: string): string | null {
    let infoJson: string;
    try {
        infoJson = ctx.strMgr.getInfoJSON2();
    } catch (e) {
        log.warn('getInfoJSON2 failed:', e);
        return null;
    }
    let info: StreamHandlerInfo[];
    try {
        info = JSON.parse(infoJson) as StreamHandlerInfo[];
    } catch {
        return null;
    }
    // Suffix match, most specific first -- see shared/fileExt.ts.
    let hit: StreamHandlerInfo | null = null;
    let best = 0;
    for (const e of info) {
        if (e.category !== SCEREADER_CATEGORY) continue;
        const len = matchExtLength(filePath, parseExtList(e.fext));
        if (len > best) {
            best = len;
            hit = e;
        }
    }
    return hit?.name ?? null;
}

export interface LoadSceneArgs {
    filePath: string;
    sceneId: number;
}

export type LoadSceneResult = Result;

/**
 * Apply each view's saved "__current" camera, mirroring the
 * `m_bSetCamera == true` block in `LoadSceneCommand::run()`. A scene with no
 * views yet (the open-into-a-fresh-scene path creates its view afterwards)
 * is a no-op.
 */
function applyCurrentCamera(scene: Scene): void {
    const uidStr = scene.view_uids;
    if (!uidStr) return;
    for (const tok of uidStr.split(',')) {
        const uid = Number(tok.trim());
        if (!Number.isFinite(uid)) continue;
        try {
            const view = scene.getView(uid) as View | null;
            if (view) scene.loadViewFromCam(uid, '__current');
        } catch (e) {
            log.warn(`loadViewFromCam failed for view ${uid}:`, e);
        }
    }
}

/**
 * Read `filePath` into `scene` and name the scene after the file. Shared by
 * the in-place load and the open-into-a-fresh-scene path; applying the saved
 * camera is left to the caller, which knows when its views exist.
 */
function readSceneFile(ctx: WorkerContext, scene: Scene, filePath: string): Result {
    // No undo transaction here, by design. A whole-scene load is not an edit:
    // it mirrors UXP `qsc-io.readSceneFile` / C++ `LoadSceneCommand::run()`,
    // both of which run outside any txn. The C++ UndoManager only keeps an edit
    // record while a txn is active, so reading a scene outside a txn lets the
    // object-registration records be discarded -- the undo stack stays empty
    // after load (matching UXP). Wrapping it in withUndoTxn was the bug: it
    // captured those records and committed them, leaving a bogus undo entry.
    const readerName = guessReaderName(ctx, filePath);
    if (!readerName) {
        log.warn(`[worker] loadScene: cannot guess reader for ${filePath}`);
        return fail(`no scene reader claims ${filePath}`, 'unsupported');
    }
    const reader = ctx.strMgr.createHandler(
        readerName,
        SCEREADER_CATEGORY,
    ) as unknown as SceneXMLReader | null;
    if (!reader) {
        log.warn(`[worker] loadScene: createHandler('${readerName}') failed`);
        return fail(`createHandler('${readerName}') failed`, 'unsupported');
    }
    reader.setPath(filePath);
    reader.attach(scene);
    try {
        reader.read();
    } catch (e) {
        // A damaged .qsc used to escape as a rejected promise that only ever
        // reached console.error; the caller shows it now like any other load.
        log.warn('[worker] loadScene: reader.read() failed:', e);
        return failFrom(e, 'io');
    } finally {
        reader.detach();
    }

    // UXP parity (qsc-io.readSceneFile): after reading, set the scene name to
    // the file's leaf name (with extension). The native LoadSceneCommand does
    // not touch the name, so without this the scene keeps the placeholder
    // "Untitled N" assigned at creation. setName fires a "name" PROPCHG event
    // that useMolViewTabTitleSync / scene tree already listen for.
    scene.setName(basename(filePath));
    return ok();
}

/**
 * Load a scene file into an existing scene (File > Reload, and opening into
 * a freshly created empty scene -- UXP `openSceneImpl`'s in-place branch).
 *
 * A scene file describes a whole scene, so reading it into an existing scene
 * REPLACES that scene's contents. `clearAllData` drops the objects,
 * renderers, cameras, style context and undo history (the scene's views
 * survive -- only `~Scene` clears the view table), mirroring UXP
 * `onReloadScene`, which clears before the read and again if the read throws
 * so a half-read scene never survives. Without the clear, File > Reload
 * Scene merged the file into the live scene and every object appeared twice.
 */
export function loadScene(ctx: WorkerContext, args: LoadSceneArgs): LoadSceneResult {
    log.info(`[worker] loading QSC scene: ${args.filePath}`);
    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found');

    scene.clearAllData();
    // `clearAllData` drops the contents but not the scene's own appearance
    // properties, and a scene created with the New Scene defaults carries
    // non-default ones. A file saved with a property at its default writes no
    // entry for it, so without this reset that property would survive the load.
    resetInitialSceneProps(scene);
    const res = readSceneFile(ctx, scene, args.filePath);
    if (!res.ok) {
        try {
            scene.clearAllData();
        } catch (e) {
            log.warn('[worker] loadScene: clearAllData after a failed read failed:', e);
        }
        return res;
    }

    applyCurrentCamera(scene);
    return ok();
}

export interface OpenSceneFileArgs {
    filePath: string;
    /** Device pixel ratio for the new view's `addView`. */
    dpr: number;
}

export type OpenSceneFileResult = Result<{
    scene_uid: number;
    view_uid: number;
    scene_name: string;
    view_name: string;
}>;

/**
 * Open a scene file into a scene of its own, for the caller to show as a new
 * tab.
 *
 * Scene creation, the read and the view creation are one step on purpose: a
 * failed read used to leave the already-created scene and its view (and the
 * tab the renderer had registered for them) behind as an empty molview. The
 * scene is dropped here when the read fails, and the view -- which the
 * renderer's tab is keyed on -- only ever exists for a scene that loaded.
 */
export function openSceneFile(ctx: WorkerContext, args: OpenSceneFileArgs): OpenSceneFileResult {
    const scene = ctx.sceMgr.createScene() as Scene | null;
    if (!scene) return fail('could not create a scene', 'native');
    const scene_uid = scene.getUID();

    const res = readSceneFile(ctx, scene, args.filePath);
    if (!res.ok) {
        try {
            ctx.sceMgr.destroyScene(scene_uid);
        } catch (e) {
            log.warn(`[worker] openSceneFile: destroyScene(${scene_uid}) failed:`, e);
        }
        return res;
    }

    // After the read, so the camera the file restored is applied to the view
    // the tab will show.
    const { view_uid, view_name } = createInitialView(ctx, scene, args.dpr);
    applyCurrentCamera(scene);

    return ok({ scene_uid, view_uid, scene_name: scene.name, view_name });
}
