/**
 * @file __test__/renderConfigContext.test.tsx
 * @description Contract tests for RenderConfigContext: persisted render
 * binary paths are loaded over the defaults on mount, and `setBinary`
 * updates state and persists via the UI_SAVE channel.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from '@renderer/__test__/helpers/testHarness';
import { IPC } from '@shared/ipcChannels';
import { RenderConfigProvider, useRenderConfig } from '@renderer/contexts/RenderConfigContext';
import { DEFAULT_RENDER_BINARIES } from '@renderer/worker/shared/renderTypes';

void React;

/** Route UI_LOAD / APP_PATH to fixed responses; everything else resolves undefined. */
function setupChannels(ui: unknown, appInfo: unknown) {
    return setupElectronAPI({
        invoke: vi.fn((channel: string) => {
            if (channel === IPC.UI_LOAD) return Promise.resolve(ui);
            if (channel === IPC.APP_PATH) return Promise.resolve(appInfo);
            return Promise.resolve(undefined);
        }),
    });
}

describe('RenderConfigContext', () => {
    afterEach(() => teardownElectronAPI());

    it('loads persisted paths over the defaults', async () => {
        setupChannels({ povrayExe: '/custom/povray' }, undefined);
        const h = makeRenderHook(() => useRenderConfig(), RenderConfigProvider);
        await flushPromises();

        expect(h.result.binaries.povrayExe).toBe('/custom/povray');
        // Fields absent from the persisted state fall back to defaults.
        expect(h.result.binaries.blendpng).toBe(DEFAULT_RENDER_BINARIES.blendpng);
        h.unmount();
    });

    it('uses the Main-resolved default (APP_PATH) when no path is persisted', async () => {
        // Fresh profile (UI_LOAD empty) -- the dev/packaged path resolved by Main
        // must take effect ahead of the compiled-in placeholder.
        const resolved = {
            povrayExe: '/home/u/tmp/proj64_deplibs/povray/bin/povray',
            povrayInc: '/home/u/tmp/proj64_deplibs/povray/include',
            blendpng: '/repo/.build_out/cuemol2/bin/blendpng',
        };
        setupChannels(undefined, { defaultRenderBinaries: resolved });
        const h = makeRenderHook(() => useRenderConfig(), RenderConfigProvider);
        await flushPromises();

        expect(h.result.binaries.blendpng).toBe(resolved.blendpng);
        expect(h.result.binaries.povrayExe).toBe(resolved.povrayExe);
        expect(h.result.binaries.povrayInc).toBe(resolved.povrayInc);
        h.unmount();
    });

    it('prefers a persisted path over the Main-resolved default', async () => {
        const resolved = {
            povrayExe: '/resolved/povray',
            povrayInc: '/resolved/inc',
            blendpng: '/resolved/blendpng',
        };
        setupChannels({ blendpng: '/user/blendpng' }, { defaultRenderBinaries: resolved });
        const h = makeRenderHook(() => useRenderConfig(), RenderConfigProvider);
        await flushPromises();

        // Persisted wins for blendpng; the other two take the resolved default.
        expect(h.result.binaries.blendpng).toBe('/user/blendpng');
        expect(h.result.binaries.povrayExe).toBe(resolved.povrayExe);
        h.unmount();
    });

    it('falls through to the compiled-in default when Main resolves empty strings', async () => {
        // Dev run without LIBCUEMOL2_ROOT / BUNDLE_APPS: Main returns empty paths.
        const empty = { povrayExe: '', povrayInc: '', blendpng: '' };
        setupChannels(undefined, { defaultRenderBinaries: empty });
        const h = makeRenderHook(() => useRenderConfig(), RenderConfigProvider);
        await flushPromises();

        expect(h.result.binaries.blendpng).toBe(DEFAULT_RENDER_BINARIES.blendpng);
        expect(h.result.binaries.povrayExe).toBe(DEFAULT_RENDER_BINARIES.povrayExe);
        h.unmount();
    });

    it('setBinary updates state and persists via UI_SAVE', async () => {
        const api = setupElectronAPI();
        const h = makeRenderHook(() => useRenderConfig(), RenderConfigProvider);
        await flushPromises();

        act(() => h.result.setBinary('blendpng', '/opt/blendpng'));

        expect(h.result.binaries.blendpng).toBe('/opt/blendpng');
        expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { blendpng: '/opt/blendpng' });
        h.unmount();
    });
});
