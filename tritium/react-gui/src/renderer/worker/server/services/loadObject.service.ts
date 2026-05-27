// Runs in Web Worker thread. Wrappers are sync (no await on C++ wrappers).
//
// Routes object-file loads through `qsys::LoadObjectCommand`, mirroring
// UXP / CLI semantics:
//
//   1. cmd.setTargetScene(scene)  -- method, NOT the auto-generated
//      `target_scene` property setter. Property setters route through
//      LScrObjBase::setPropHelper -> setupParentData which clobbers the
//      scene's m_thisname / m_rootuid and breaks nested undo records.
//   2. file_path / file_format / object_name / content_first are string /
//      boolean properties, which are no-ops in setupParentData and safe.
//   3. cmd.run() picks the reader via guessFileFormat(catID, content_first),
//      reads the file, names the new object, and calls scene.addObject().
//   4. cmd.result_object is a readonly getter -- getter paths never call
//      setupParentData, so it is safe to read back.
//
// Renderer-side setup (selection / colorscheme / render-style) stays
// outside the command path and runs via setupRenderer().
import type { WorkerContext } from '../types/WorkerContext';
import type { LoadObjectCommand } from '@cuemol/core/src/wrappers/LoadObjectCommand';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import type { FileOpenOptions } from '../../../components/fopen-opt-dlgs/types';
import { setupRenderer } from './setupRenderer.service';
import { withUndoTxn } from './withUndoTxn';

const log = console;

export interface LoadObjectArgs {
    filePath: string;
    sceneId: number;
    options: FileOpenOptions;
    /**
     * When true, ignore the file extension and have C++ side pick the
     * reader purely by content-sniffing every registered reader. When
     * false (default), the extension narrows the candidate set first.
     */
    contentFirst: boolean;
}

function loadObject(ctx: WorkerContext, args: LoadObjectArgs): { ok: boolean } {
    log.info(`[worker] loading object file: ${args.filePath} (contentFirst=${args.contentFirst})`);
    const scene = ctx.sceMgr.getScene(args.sceneId) as Scene;

    return withUndoTxn(scene, 'Open file', () => {
        const cmd = ctx.cmdMgr.getCmd('load_object') as unknown as LoadObjectCommand | null;
        if (!cmd) {
            log.warn('[worker] loadObject: load_object command not registered');
            return { ok: false };
        }

        // Method-based scene setter avoids the parent-linkage corruption
        // the auto-generated `target_scene` property setter would cause.
        cmd.setTargetScene(scene);
        cmd.file_path = args.filePath;
        // Empty file_format hands picking back to guessFileFormat().
        cmd.file_format = '';
        cmd.object_name = args.options.renderer.objectName ?? '';
        // Enum properties cross the wrapper as their string ID, but
        // boolean properties go through as plain booleans.
        cmd.content_first = args.contentFirst;

        if (args.options.format.kind !== 'unknown') {
            log.info(
                `[worker] loadObject: format=${args.options.format.kind} options dropped (not wired to C++)`,
            );
        }

        try {
            cmd.run();
        } catch (e) {
            log.warn('[worker] loadObject: cmd.run() failed:', e);
            throw e;  // bubble up so withUndoTxn rolls back
        }

        const mol = cmd.result_object as unknown as MolCoord | null;
        if (!mol) {
            log.warn('[worker] loadObject: result_object is null');
            return { ok: false };
        }

        setupRenderer(ctx, mol, args.options.renderer);
        return { ok: true };
    });
}

export const services = { loadObject };
