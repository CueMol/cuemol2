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

import type { WorkerContext } from '../types/WorkerContext';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { SceneXMLReader } from '@cuemol/core/src/wrappers/SceneXMLReader';
import type { View } from '@cuemol/core/src/wrappers/View';
import { matchExtLength, parseExtList } from '@shared/fileExt';

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

function loadScene(ctx: WorkerContext, args: LoadSceneArgs): { ok: boolean } {
    log.info(`[worker] loading QSC scene: ${args.filePath}`);
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;

    // No undo transaction here, by design. A whole-scene load is not an edit:
    // it mirrors UXP `qsc-io.readSceneFile` / C++ `LoadSceneCommand::run()`,
    // both of which run outside any txn. The C++ UndoManager only keeps an edit
    // record while a txn is active, so reading a scene outside a txn lets the
    // object-registration records be discarded -- the undo stack stays empty
    // after load (matching UXP). Wrapping it in withUndoTxn was the bug: it
    // captured those records and committed them, leaving a bogus undo entry.
    const readerName = guessReaderName(ctx, args.filePath);
    if (!readerName) {
        log.warn(`[worker] loadScene: cannot guess reader for ${args.filePath}`);
        return { ok: false };
    }
    const reader = ctx.strMgr.createHandler(
        readerName,
        SCEREADER_CATEGORY,
    ) as unknown as SceneXMLReader | null;
    if (!reader) {
        log.warn(`[worker] loadScene: createHandler('${readerName}') failed`);
        return { ok: false };
    }
    reader.setPath(args.filePath);
    reader.attach(scene);
    try {
        reader.read();
    } finally {
        reader.detach();
    }

    // UXP parity (qsc-io.readSceneFile): after reading, set the scene name to
    // the file's leaf name (with extension). The native LoadSceneCommand does
    // not touch the name, so without this the scene keeps the placeholder
    // "Untitled N" assigned at creation. setName fires a "name" PROPCHG event
    // that useMolViewTabTitleSync / scene tree already listen for.
    scene.setName(basename(args.filePath));

    // Apply the saved "__current" camera to every view, mirroring the
    // `m_bSetCamera == true` block in LoadSceneCommand::run().
    const uidStr = scene.view_uids;
    if (uidStr) {
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
    return { ok: true };
}

export const services = { loadScene };
