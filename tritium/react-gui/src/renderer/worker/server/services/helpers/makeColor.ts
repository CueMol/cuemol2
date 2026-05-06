import type { WorkerContext } from '../../types/WorkerContext';
import type { AbstractColor } from '@cuemol/core/src/wrappers/AbstractColor';

export function makeColor(ctx: WorkerContext, str: string, uid: number = 0): AbstractColor {
    return ctx.styleMgr.compileColor(str, uid || 0);
}
