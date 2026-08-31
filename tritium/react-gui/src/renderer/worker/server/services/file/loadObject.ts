// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Loads an object file directly through a StreamManager reader, mirroring
// the UXP fileOpenHelper1 flow (uxp_gui/cuemol2/base/content/fileopen.js):
//
//   1. pickReaderName() resolves the reader nickname the same way the C++
//      LoadObjectCommand::guessFileFormat() does (and the same way the
//      dialog's renderer-type preview did), so this load and the preview
//      agree on which reader runs.
//   2. createHandler() + setPath() + (.gz) compress mirror UXP's reader
//      setup.
//   3. applyReaderOptions() wires the dialog's format-specific options
//      (loadModel, build2ndry, clmn_F, normalize, vertex_file, psf, ...)
//      onto the reader BEFORE read(). LoadObjectCommand had no interface
//      for this, which is why these options were previously dropped.
//   4. createDefaultObj / attach / read / detach / name / addObject runs
//      inside the undo txn so a parse failure rolls back cleanly.
//
// Renderer-side setup (selection / colorscheme / render-style) stays
// outside the reader path and runs via setupRenderer().
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { Object as CObject } from '@cuemol/core/src/wrappers/Object';
import type { FileOpenOptions } from '@renderer/worker/shared/fileOpenTypes';
import { setupRenderer } from '../rend/setupRenderer';
import { undoTxnResult } from '../withUndoTxn';
import { pickReaderName, OBJREADER_CATEGORY } from '@renderer/worker/server/services/helpers/pickReaderName';
import { applyReaderOptions } from '@renderer/worker/server/services/helpers/applyReaderOptions';
import { applyMapTypeChoice, applyEmMapDefaults, applyMapCenterPolicy } from '@renderer/worker/server/services/map/emDefaults';
import { fail, failFrom, ok, type Result } from '@renderer/worker/shared/result';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';

const log = console;

export interface LoadObjectArgs {
    filePath: string;
    sceneId: number;
    options: FileOpenOptions;
    /**
     * When true, ignore the file extension and pick the reader purely by
     * content-sniffing every registered reader. When false (default), the
     * extension narrows the candidate set first.
     */
    contentFirst: boolean;
    /**
     * Optional ceiling of the escalating content-sniff byte budget
     * forwarded to pickReaderName (see shared/sniffConfig.ts). 0 /
     * undefined falls back to DEFAULT_SNIFF_CAP. Lets scripts bound sniff
     * against pathological / very large inputs.
     */
    maxSniffBytes?: number;
    /**
     * Explicit reader nickname to use, bypassing sniff. Set when the caller
     * already resolved the reader (dialog preview / MRU reopen) so the load
     * uses the exact same reader.
     */
    readerName?: string;
}

/**
 * Default object name: the file's basename with its final extension removed.
 * Mirrors C++ LoadObjectCommand::createDefaultObjName (path stem).
 */
function fileStem(filePath: string): string {
    const base = filePath.split(/[\\/]/).pop() ?? filePath;
    return base.replace(/\.[^.]+$/, '');
}

/** `{ objId }` of the new object on success. */
export type LoadObjectResult = Result<{ objId: number }>;

export function loadObject(ctx: WorkerContext, args: LoadObjectArgs): LoadObjectResult {
    log.info(`[worker] loading object file: ${args.filePath} (contentFirst=${args.contentFirst})`);

    const nickname = args.readerName ?? pickReaderName(ctx, args.filePath, args.contentFirst, args.maxSniffBytes);
    if (!nickname) {
        log.warn(`[worker] loadObject: no reader matched ${args.filePath}`);
        return fail(`no reader matched ${args.filePath}`, 'unsupported');
    }

    const reader = ctx.strMgr.createHandler(nickname, OBJREADER_CATEGORY) as unknown as ObjReader | null;
    if (!reader) {
        log.warn(`[worker] loadObject: createHandler failed for "${nickname}"`);
        return fail(`createHandler failed for "${nickname}"`, 'unsupported');
    }

    reader.setPath(args.filePath);
    // Transparent gzip, mirroring UXP fileopen.js (reader.compress = "gzip").
    // compress is enum-typed in the wrapper but accepts strings at runtime.
    if (args.filePath.toLowerCase().endsWith('.gz')) {
        (reader as unknown as { compress: string }).compress = 'gzip';
    }
    // Wire the dialog's format-specific reader options before read().
    applyReaderOptions(reader, nickname, args.options.format);

    const scene = getSceneOrNull(ctx, args.sceneId);
    if (!scene) return fail(`scene ${args.sceneId} not found`, 'not-found');

    return undoTxnResult(scene, 'Open file', () => {
        let obj: CObject | null = null;
        try {
            obj = reader.createDefaultObj() as unknown as CObject;
            reader.attach(obj);
            try {
                reader.read();
            } finally {
                reader.detach();
            }
        } catch (e) {
            // A parse failure rolls the transaction back (undoTxnResult sees
            // the Fail) and reaches the dialog as its message, not as a
            // rejected promise.
            log.warn('[worker] loadObject: reader.read() failed:', e);
            return failFrom(e, 'io');
        }

        if (!obj) {
            log.warn('[worker] loadObject: createDefaultObj returned null');
            return fail('the reader produced no object', 'io');
        }

        (obj as unknown as { name: string }).name =
            args.options.renderer.objectName || fileStem(args.filePath);
        // The dialog's map kind override (DensityMap.map_type) goes on the
        // object, so it must be set before the renderer resolves its region.
        applyMapTypeChoice(obj, args.options.format);
        (scene as unknown as { addObject: (o: CObject) => void }).addObject(obj);

        const rend = setupRenderer(ctx, obj, args.options.renderer);
        if (rend) {
            // Cryo-EM map: an absolute level enclosing the top 1% of the grid
            // (a sigma level means little on a masked EM map). Independent of
            // what the view does, so it is not gated on the view policy.
            applyEmMapDefaults(obj, rend);
            // What the view does for a volume object (UXP's scalar-object
            // deck). Runs here rather than in setupRenderer because `auto`
            // reads the map kind, which only exists once the reader has run.
            applyMapCenterPolicy(scene, obj, rend, args.options.renderer.mapCenterPolicy);
        }
        return ok({ objId: (obj as unknown as { uid: number }).uid });
    });
}
