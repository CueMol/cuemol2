import type { WorkerContext } from '../types/WorkerContext';
import type { LoadSceneCommand } from '@cuemol/core/src/wrappers/LoadSceneCommand';

const log = console;

export const name = 'loadScene';

export interface LoadSceneArgs {
    filePath: string;
    sceneId: number;
}

export default function loadScene(ctx: WorkerContext, args: LoadSceneArgs): { ok: boolean } {
    log.info(`[worker] loading QSC scene: ${args.filePath}`);
    const scene = ctx.sceMgr.getScene(args.sceneId);
    const cmd = ctx.cmdMgr.getCmd('load_scene') as LoadSceneCommand;
    cmd.target_scene = scene;
    cmd.file_path = args.filePath;
    cmd.set_camera = true;
    cmd.run();
    return { ok: true };
}
