/**
 * @file __test__/drainLogMessages.test.ts
 * @description Pins the observable contract of the drainLogMessages worker
 * service, which replaces the renderer's only ObjProxy callsite (the MsgLog
 * proxy in useLogEvent -- see ADR-0033). The service must resolve the MsgLog
 * singleton via the worker-internal sync helper, return its accumulated text,
 * then clear it -- in that order. Also asserts useLogEvent no longer holds an
 * ObjProxy (no cm.getService) so the leak cannot regress.
 *
 * MsgLog is mocked as a plain object whose methods record call order
 * (CLAUDE.md worker-service test pattern).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { services } from '../worker/server/services/drainLogMessages.service';
import type { WorkerContext } from '../worker/server/types/WorkerContext';

function makeCtx(msgLog: unknown) {
    const getService = vi.fn((name: string) => (name === 'MsgLog' ? msgLog : null));
    const ctx = { svc: { getService } } as unknown as WorkerContext;
    return { ctx, getService };
}

describe('drainLogMessages service', () => {
    it('reads MsgLog via the sync helper, returns the accumulated msg, then clears it', () => {
        const order: string[] = [];
        const msgLog = {
            getAccumMsg: vi.fn(() => {
                order.push('getAccumMsg');
                return 'hello\nworld\n';
            }),
            removeAccumMsg: vi.fn(() => {
                order.push('removeAccumMsg');
            }),
        };
        const { ctx, getService } = makeCtx(msgLog);

        const res = services.drainLogMessages(ctx);

        expect(getService).toHaveBeenCalledWith('MsgLog');
        expect(msgLog.getAccumMsg).toHaveBeenCalledTimes(1);
        expect(msgLog.removeAccumMsg).toHaveBeenCalledTimes(1);
        // getAccumMsg must run before removeAccumMsg, else the drain returns
        // already-cleared (empty) text.
        expect(order).toEqual(['getAccumMsg', 'removeAccumMsg']);
        expect(res).toEqual({ msg: 'hello\nworld\n' });
    });

    it('returns an empty msg and never clears when MsgLog is unavailable', () => {
        const { ctx, getService } = makeCtx(null);

        const res = services.drainLogMessages(ctx);

        expect(getService).toHaveBeenCalledWith('MsgLog');
        expect(res).toEqual({ msg: '' });
    });
});

describe('useLogEvent no longer holds an ObjProxy', () => {
    it('does not call cm.getService (the ADR-0033 leak callsite is removed)', () => {
        const src = readFileSync(
            resolve(process.cwd(), 'src/renderer/hooks/useLogEvent.ts'),
            'utf8',
        );
        expect(src).not.toMatch(/getService/);
        expect(src).toMatch(/invokeService\('drainLogMessages'/);
    });
});
