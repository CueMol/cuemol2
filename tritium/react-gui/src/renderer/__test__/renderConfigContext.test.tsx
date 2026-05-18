/**
 * @file __test__/renderConfigContext.test.tsx
 * @description Contract tests for RenderConfigContext: persisted render
 * binary paths are loaded over the defaults on mount, and `setBinary`
 * updates state and persists via the UI_SAVE channel.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from './helpers/testHarness';
import { IPC } from '../../shared/ipcChannels';
import { RenderConfigProvider, useRenderConfig } from '../contexts/RenderConfigContext';
import { DEFAULT_RENDER_BINARIES } from '../worker/shared/renderTypes';

void React;

describe('RenderConfigContext', () => {
    afterEach(() => teardownElectronAPI());

    it('loads persisted paths over the defaults', async () => {
        setupElectronAPI({
            invoke: vi.fn((channel: string) =>
                channel === IPC.UI_LOAD
                    ? Promise.resolve({ povrayExe: '/custom/povray' })
                    : Promise.resolve(undefined),
            ),
        });
        const h = makeRenderHook(() => useRenderConfig(), RenderConfigProvider);
        await flushPromises();

        expect(h.result.binaries.povrayExe).toBe('/custom/povray');
        // Fields absent from the persisted state fall back to defaults.
        expect(h.result.binaries.blendpng).toBe(DEFAULT_RENDER_BINARIES.blendpng);
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
