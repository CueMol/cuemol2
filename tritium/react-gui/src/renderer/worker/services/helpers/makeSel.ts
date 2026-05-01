import type { WorkerContext } from '../../types/WorkerContext';
import type { SelCommand } from '@cuemol/core/src/wrappers/SelCommand';

export function makeSel(ctx: WorkerContext, selstr: string, uid: number = 0): SelCommand | null {
    const sel = ctx.svc.createCppObj('SelCommand') as SelCommand;
    if (!sel) return null;
    if (selstr) {
        if (!sel.compile(selstr, uid || 0)) return null;
    }
    return sel;
}
