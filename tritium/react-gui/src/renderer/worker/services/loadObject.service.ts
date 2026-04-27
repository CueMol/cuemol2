import type { WorkerContext } from '../types/WorkerContext';
import type { LoadObjectCommand } from '@cuemol/core/src/wrappers/LoadObjectCommand';
import type { MolCoord } from '@cuemol/core/src/wrappers/MolCoord';
import type { FileOpenOptions } from '../../components/fopen-opt-dlgs/types';
import { setupRenderer } from './setupRenderer.service';

const log = console;

export const name = 'loadObject';

export interface LoadObjectArgs {
    filePath: string;
    sceneId: number;
    options: FileOpenOptions;
}

export default function loadObject(ctx: WorkerContext, args: LoadObjectArgs): { ok: boolean } {
    log.info(`[worker] loading object file: ${args.filePath}`);
    const scene = ctx.sceMgr.getScene(args.sceneId);
    const cmd = ctx.cmdMgr.getCmd('load_object') as LoadObjectCommand;
    cmd.target_scene = scene;
    cmd.file_path = args.filePath;
    if (args.options.format.kind !== 'unknown') {
        log.info(`[worker] loadObject: format=${args.options.format.kind} options dropped (not wired to C++)`);
    }
    cmd.run();
    const mol = cmd.result_object as MolCoord;

    if (args.options.renderer.objectName) {
        mol.name = args.options.renderer.objectName;
    }
    setupRenderer(ctx, mol, args.options.renderer);
    return { ok: true };
}
