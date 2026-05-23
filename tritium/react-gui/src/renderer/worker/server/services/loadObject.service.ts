// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Why this no longer goes through `LoadObjectCommand`:
//
// The auto-generated wrapper setter `cmd.target_scene = scene` ends up
// calling `setPropHelper` -> `setupParentData("target_scene")` on the
// command, which overwrites the scene's `m_thisname` to "target_scene"
// and re-parents it under the command. Any subsequent child-property
// assignment under that scene then produces a path like
// "target_scenefoo" with no dot, which NestedPropHandler cannot
// navigate (see `setupRenderer.service.ts` header for the full
// explanation -- same root cause via `cmd.target_object = mol`).
//
// UXP loads objects via `smg.loadObjectAsync(reader)` (a method, not a
// command property). Tritium's worker mirrors the synchronous
// `LoadObjectCommand::run()` body directly: create reader from format,
// read into a fresh object, name it, then `scene.addObject(obj)` -- no
// command property setters involved, so the scene's parent linkage stays
// intact.
import type { WorkerContext } from '../types/WorkerContext';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { FileOpenOptions } from '../../../components/fopen-opt-dlgs/types';
import { setupRenderer } from './setupRenderer.service';
import { withUndoTxn } from './withUndoTxn';

const log = console;

const OBJREADER_CATEGORY = 0;

interface StreamHandlerInfo {
    name: string;
    fext: string;
    category: number;
}

/**
 * Mirror `LoadObjectCommand::guessFileFormat(IOH_CAT_OBJREADER)` (0):
 * walk the strMgr handler catalogue, find the first ObjReader whose
 * registered file extensions match `filePath`'s ext. Returns null when
 * no match is found (caller surfaces the error to the user).
 */
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
    // .pdb.gz / .ent.gz / .cif.gz etc: strip the .gz so the reader matches the
    // underlying format, not the compression.
    const lowered = filePath.toLowerCase();
    const stripped = lowered.endsWith('.gz')
        ? lowered.slice(0, -3)
        : lowered;
    const ext = stripped.split('.').pop() ?? '';
    if (!ext) return null;
    const hit = info.find(
        (e) =>
            e.category === OBJREADER_CATEGORY &&
            e.fext
                .split(';')
                .map((s) => s.trim().replace(/^\*\./, '').toLowerCase())
                .includes(ext),
    );
    return hit?.name ?? null;
}

/** Stem (filename without directory or extension) for default object name. */
function fileStem(filePath: string): string {
    const base = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
    const dot = base.lastIndexOf('.');
    if (dot <= 0) return base;
    // Strip the trailing extension (e.g. "1ubq.pdb" -> "1ubq"). Doesn't
    // unwrap nested extensions, mirroring boost::path::stem.
    return base.slice(0, dot);
}

export interface LoadObjectArgs {
    filePath: string;
    sceneId: number;
    options: FileOpenOptions;
}

function loadObject(ctx: WorkerContext, args: LoadObjectArgs): { ok: boolean } {
    log.info(`[worker] loading object file: ${args.filePath}`);
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;

    return withUndoTxn(scene, 'Open file', () => {
        const readerName = guessReaderName(ctx, args.filePath);
        if (!readerName) {
            log.warn(`[worker] loadObject: cannot guess reader for ${args.filePath}`);
            return { ok: false };
        }
        const reader = ctx.strMgr.createHandler(
            readerName,
            OBJREADER_CATEGORY,
        ) as ObjReader | null;
        if (!reader) {
            log.warn(`[worker] loadObject: createHandler('${readerName}') failed`);
            return { ok: false };
        }
        reader.setPath(args.filePath);
        // C++ LoadObjectCommand::run sets `compress="gzip"` for .gz files
        // so the reader knows to wrap the input stream. Enum properties
        // accept their string ID at runtime (the TS wrapper types it as
        // number; cast to bypass).
        if (args.filePath.toLowerCase().endsWith('.gz')) {
            (reader as unknown as { compress: number }).compress =
                'gzip' as unknown as number;
        }

        if (args.options.format.kind !== 'unknown') {
            log.info(
                `[worker] loadObject: format=${args.options.format.kind} options dropped (not wired to C++)`,
            );
        }

        const mol = reader.createDefaultObj() as MolCoord | null;
        if (!mol) {
            log.warn('[worker] loadObject: createDefaultObj returned null');
            return { ok: false };
        }
        reader.attach(mol as never);
        try {
            reader.read();
        } finally {
            reader.detach();
        }

        const desiredName = args.options.renderer.objectName || fileStem(args.filePath);
        (mol as unknown as { name: string }).name = desiredName;
        // Direct addObject -- avoids the cmd.target_scene = scene path
        // that would re-parent the scene under the command.
        (scene as unknown as { addObject: (o: unknown) => void }).addObject(mol);

        setupRenderer(ctx, mol, args.options.renderer);
        return { ok: true };
    });
}

export const services = { loadObject };
