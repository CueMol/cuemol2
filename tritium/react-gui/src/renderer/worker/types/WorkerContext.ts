import type { WorkerService } from '../WorkerService';
import type { SceneManager } from '@cuemol/core/src/wrappers/SceneManager';
import type { CmdMgr } from '@cuemol/core/src/wrappers/CmdMgr';
import type { StreamManager } from '@cuemol/core/src/wrappers/StreamManager';
import type { StyleManager } from '@cuemol/core/src/wrappers/StyleManager';

export interface WorkerContext {
    svc: WorkerService;
    sceMgr: SceneManager;
    cmdMgr: CmdMgr;
    strMgr: StreamManager;
    styleMgr: StyleManager;
}
