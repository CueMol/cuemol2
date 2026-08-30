/**
 * @file main/ipc/windowRelay.test.ts
 * @description The three ways a relayed question ends.
 *
 * These used to be three hand-written copies of the same correlation-id
 * machinery, one per question, and only the hatch copy distinguished
 * "unavailable" from "timeout". Pinning the outcomes here is what lets a
 * fourth question be a row in RelayKinds rather than a fourth copy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({}));

import { IPC } from '@shared/ipcChannels';
import { makeWindowRelay } from './windowRelay';

/** A window stub recording what was pushed at it. */
function makeWindow(destroyed = false) {
    const sent: { channel: string; payload: unknown }[] = [];
    return {
        sent,
        isDestroyed: () => destroyed,
        webContents: {
            send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
        },
    };
}

describe('makeWindowRelay', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('resolves with the answer the window replies with', async () => {
        const win = makeWindow();
        const relay = makeWindowRelay(win as never);

        const p = relay.request('viewSize', undefined);
        const { kind, reqId, req } = win.sent[0].payload as {
            kind: string; reqId: number; req: unknown;
        };
        expect(win.sent[0].channel).toBe(IPC.RENDER_RELAY_REQUEST);
        expect(kind).toBe('viewSize');
        expect(req).toBeUndefined();

        relay.reply({ kind: 'viewSize', reqId, res: { width: 800, height: 600 } });
        await expect(p).resolves.toEqual({ width: 800, height: 600 });
    });

    it('carries the request payload out to the window', async () => {
        const win = makeWindow();
        const relay = makeWindowRelay(win as never);

        const p = relay.request('viewCamera', { viewId: 7 });
        const sent = win.sent[0].payload as { reqId: number; req: unknown };
        expect(sent.req).toEqual({ viewId: 7 });

        relay.reply({ kind: 'viewCamera', reqId: sent.reqId, res: { perspective: true } });
        await expect(p).resolves.toEqual({ perspective: true });
    });

    it('gives up with the timeout value when no reply arrives', async () => {
        const win = makeWindow();
        const relay = makeWindowRelay(win as never, 50);

        const size = relay.request('viewSize', undefined);
        const hatch = relay.request('hatchStyle', { style: 'manga' });
        vi.advanceTimersByTime(50);

        await expect(size).resolves.toBeNull();
        await expect(hatch).resolves.toEqual({ ok: false, error: 'timeout' });
    });

    it('fails without asking when the window is gone', async () => {
        const win = makeWindow(true);
        const relay = makeWindowRelay(win as never);

        await expect(relay.request('viewSize', undefined)).resolves.toBeNull();
        await expect(relay.request('hatchStyle', { style: 'x' })).resolves.toEqual({
            ok: false,
            error: 'main window unavailable',
        });
        expect(win.sent).toHaveLength(0);
    });

    it('ignores a reply that arrives after the timeout, and an unknown one', async () => {
        const win = makeWindow();
        const relay = makeWindowRelay(win as never, 50);

        const p = relay.request('viewSize', undefined);
        const { reqId } = win.sent[0].payload as { reqId: number };
        vi.advanceTimersByTime(50);
        await expect(p).resolves.toBeNull();

        expect(() => {
            relay.reply({ kind: 'viewSize', reqId, res: { width: 1, height: 1 } });
            relay.reply({ kind: 'viewSize', reqId: 999, res: null });
        }).not.toThrow();
    });

    it('keeps concurrent questions apart', async () => {
        const win = makeWindow();
        const relay = makeWindowRelay(win as never);

        const a = relay.request('viewCamera', { viewId: 1 });
        const b = relay.request('viewCamera', { viewId: 2 });
        const [idA, idB] = win.sent.map((s) => (s.payload as { reqId: number }).reqId);
        expect(idA).not.toBe(idB);

        relay.reply({ kind: 'viewCamera', reqId: idB, res: { perspective: false } });
        relay.reply({ kind: 'viewCamera', reqId: idA, res: { perspective: true } });
        await expect(a).resolves.toEqual({ perspective: true });
        await expect(b).resolves.toEqual({ perspective: false });
    });
});
