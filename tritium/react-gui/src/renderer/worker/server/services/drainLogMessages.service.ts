/**
 * @file worker/server/services/drainLogMessages.service.ts
 * @description Worker-side service that drains the process-wide message log.
 *
 * `MsgLog` is a process-wide singleton; `getAccumMsg()` / `removeAccumMsg()`
 * take no arguments. This service returns the messages accumulated before the
 * renderer subscribed to the `log` event category, then clears them so they are
 * not re-delivered. It exists so the renderer never has to hold an `ObjProxy`
 * to `MsgLog` (the only renderer ObjProxy callsite -- see ADR-0033); the
 * renderer calls `invokeService('drainLogMessages', {})` instead.
 *
 * Runs in the Web Worker thread; C++ wrappers are synchronous (no await).
 */
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { MsgLog } from '@cuemol/core/src/wrappers/MsgLog';

export interface DrainLogMessagesResult {
    /** Accumulated log text (empty string when MsgLog is unavailable or empty). */
    msg: string;
}

/**
 * Read and clear the accumulated log messages.
 *
 * @returns The accumulated message text, then clears the accumulator.
 */
function drainLogMessages(ctx: WorkerContext): DrainLogMessagesResult {
    const msgLog = ctx.svc.getService('MsgLog') as MsgLog | null;
    if (!msgLog) return { msg: '' };
    const msg = msgLog.getAccumMsg();
    msgLog.removeAccumMsg();
    return { msg };
}

export const services = { drainLogMessages };
