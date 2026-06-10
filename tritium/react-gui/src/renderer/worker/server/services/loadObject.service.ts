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
import type { WorkerContext } from '../types/WorkerContext';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { Object as CObject } from '@cuemol/core/src/wrappers/Object';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { FileOpenOptions } from '../../../components/fopen-opt-dlgs/types';
import { setupRenderer } from './setupRenderer.service';
import { withUndoTxn } from './withUndoTxn';
import { pickReaderName, OBJREADER_CATEGORY } from './helpers/pickReaderName';
import { applyReaderOptions } from './helpers/applyReaderOptions';

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
     * Optional byte cap forwarded to pickReaderName's content-sniff. 0 /
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

function loadObject(ctx: WorkerContext, args: LoadObjectArgs): { ok: boolean } {
    log.info(`[worker] loading object file: ${args.filePath} (contentFirst=${args.contentFirst})`);

    const nickname = args.readerName ?? pickReaderName(ctx, args.filePath, args.contentFirst, args.maxSniffBytes);
    if (!nickname) {
        log.warn(`[worker] loadObject: no reader matched ${args.filePath}`);
        return { ok: false };
    }

    const reader = ctx.strMgr.createHandler(nickname, OBJREADER_CATEGORY) as unknown as ObjReader | null;
    if (!reader) {
        log.warn(`[worker] loadObject: createHandler failed for "${nickname}"`);
        return { ok: false };
    }

    reader.setPath(args.filePath);
    // Transparent gzip, mirroring UXP fileopen.js (reader.compress = "gzip").
    // compress is enum-typed in the wrapper but accepts strings at runtime.
    if (args.filePath.toLowerCase().endsWith('.gz')) {
        (reader as unknown as { compress: string }).compress = 'gzip';
    }
    // Wire the dialog's format-specific reader options before read().
    applyReaderOptions(reader, nickname, args.options.format);

    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;

    return withUndoTxn(scene, 'Open file', () => {
        let obj: CObject | null = null;
        try {
            obj = reader.createDefaultObj() as unknown as CObject;
            reader.attach(obj);
            reader.read();
            reader.detach();
        } catch (e) {
            log.warn('[worker] loadObject: reader.read() failed:', e);
            throw e;  // bubble up so withUndoTxn rolls back
        }

        if (!obj) {
            log.warn('[worker] loadObject: createDefaultObj returned null');
            return { ok: false };
        }

        (obj as unknown as { name: string }).name =
            args.options.renderer.objectName || fileStem(args.filePath);
        (scene as unknown as { addObject: (o: CObject) => void }).addObject(obj);

        setupRenderer(ctx, obj, args.options.renderer);
        return { ok: true };
    });
}

export const services = { loadObject };
