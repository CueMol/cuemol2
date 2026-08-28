/**
 * @file __test__/useHatchTemplate.test.ts
 * @description Contract tests for the hatch style template loader: it fetches
 * the selected style while it is not loaded, hands the parsed template over,
 * drops a reply that arrives after the style moved on, and only reports a
 * failed load (the render then uses the style's own configuration).
 */

import { describe, it, expect, vi } from 'vitest';
import { act, useState } from 'react';
import { makeRenderHook, flushPromises } from './helpers/testHarness';
import { useHatchTemplate } from '../hooks/useHatchTemplate';
import type { HatchStyleSpecReply } from '@shared/ipcTypes';

const okReply = (spec: string): HatchStyleSpecReply => ({ ok: true, spec });

describe('useHatchTemplate', () => {
    it('fetches an unloaded style and hands the parsed template over', async () => {
        const fetchSpec = vi.fn(() => Promise.resolve(okReply('layer: kind=dot\ntone: strength=2')));
        const onLoaded = vi.fn();
        const h = makeRenderHook(() =>
            useHatchTemplate({ enabled: true, style: 'manga', loaded: false, fetchSpec, onLoaded }),
        );
        expect(h.result.status).toBe('loading');
        await act(async () => { await flushPromises(); });
        expect(fetchSpec).toHaveBeenCalledWith('manga');
        expect(onLoaded).toHaveBeenCalledTimes(1);
        const [style, spec] = onLoaded.mock.calls[0];
        expect(style).toBe('manga');
        expect(spec.layers[0].kind).toBe('dot');
        expect(spec.tone.strength).toBe(2);
        expect(h.result.status).toBe('ready');
        h.unmount();
    });

    it('does not fetch a loaded style, nor anything when disabled', () => {
        const fetchSpec = vi.fn(() => Promise.resolve(okReply('')));
        const loaded = makeRenderHook(() =>
            useHatchTemplate({ enabled: true, style: 'manga', loaded: true, fetchSpec, onLoaded: vi.fn() }),
        );
        expect(loaded.result.status).toBe('ready');
        const off = makeRenderHook(() =>
            useHatchTemplate({ enabled: false, style: 'manga', loaded: false, fetchSpec, onLoaded: vi.fn() }),
        );
        expect(off.result.status).toBe('idle');
        expect(fetchSpec).not.toHaveBeenCalled();
        loaded.unmount();
        off.unmount();
    });

    it('reports a failed load without touching the settings', async () => {
        const fetchSpec = vi.fn(() => Promise.resolve({ ok: false, error: 'unknown hatch style: x' } as HatchStyleSpecReply));
        const onLoaded = vi.fn();
        const h = makeRenderHook(() =>
            useHatchTemplate({ enabled: true, style: 'x', loaded: false, fetchSpec, onLoaded }),
        );
        await act(async () => { await flushPromises(); });
        expect(h.result.status).toBe('error');
        expect(h.result.error).toBe('unknown hatch style: x');
        expect(onLoaded).not.toHaveBeenCalled();
        h.unmount();
    });

    it('drops a reply that arrives after the style changed', async () => {
        let resolveA: ((r: HatchStyleSpecReply) => void) | null = null;
        const fetchSpec = vi.fn((style: string) =>
            style === 'a'
                ? new Promise<HatchStyleSpecReply>((res) => { resolveA = res; })
                : Promise.resolve(okReply('layer: kind=line')),
        );
        const onLoaded = vi.fn();
        // The style lives in state so switching it re-renders the hook (a bare
        // rerender of the same element bails out).
        const h = makeRenderHook(() => {
            const [style, setStyle] = useState('a');
            const r = useHatchTemplate({ enabled: true, style, loaded: false, fetchSpec, onLoaded });
            return { ...r, setStyle };
        });
        act(() => { h.result.setStyle('b'); });
        await act(async () => { await flushPromises(); });
        act(() => { resolveA!(okReply('layer: kind=dot')); });
        await act(async () => { await flushPromises(); });
        // Only the current style's template reached the settings.
        expect(onLoaded.mock.calls.map((c) => c[0])).toEqual(['b']);
        h.unmount();
    });
});
