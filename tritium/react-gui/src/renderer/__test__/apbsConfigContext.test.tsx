/**
 * @file __test__/apbsConfigContext.test.tsx
 * @description Contract tests for ApbsConfigContext: the APBS / pdb2pqr exe
 * paths resolve with the same three-level fallback as RenderConfigContext
 * (persisted UI_LOAD -> Main-resolved APP_PATH default -> compiled-in), and
 * `setValue` updates state and persists via UI_SAVE. Pins that a packaged /
 * dev build auto-defaults to the bundled binaries without user config.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { makeRenderHook, setupElectronAPI, teardownElectronAPI, flushPromises } from './helpers/testHarness';
import { IPC } from '@shared/ipcChannels';
import { ApbsConfigProvider, useApbsConfig } from '../contexts/ApbsConfigContext';
import { DEFAULT_APBS_BINARIES } from '../worker/shared/apbsTypes';

void React;

function setupChannels(ui: unknown, appInfo: unknown) {
    return setupElectronAPI({
        invoke: vi.fn((channel: string) => {
            if (channel === IPC.UI_LOAD) return Promise.resolve(ui);
            if (channel === IPC.APP_PATH) return Promise.resolve(appInfo);
            return Promise.resolve(undefined);
        }),
    });
}

const BUNDLED = {
    apbsExe: '/Applications/CueMol.app/Contents/Resources/bundle_apps/apbs/apbs',
    pdb2pqrExe: '/Applications/CueMol.app/Contents/Resources/bundle_apps/apbs/pdb2pqr',
};

describe('ApbsConfigContext', () => {
    afterEach(() => teardownElectronAPI());

    it('uses the Main-resolved bundled default when no path is persisted', async () => {
        setupChannels(undefined, { defaultApbsBinaries: BUNDLED });
        const h = makeRenderHook(() => useApbsConfig(), ApbsConfigProvider);
        await flushPromises();

        expect(h.result.config.apbsExe).toBe(BUNDLED.apbsExe);
        expect(h.result.config.pdb2pqrExe).toBe(BUNDLED.pdb2pqrExe);
        h.unmount();
    });

    it('prefers a persisted path over the bundled default', async () => {
        setupChannels({ apbsExe: '/user/apbs' }, { defaultApbsBinaries: BUNDLED });
        const h = makeRenderHook(() => useApbsConfig(), ApbsConfigProvider);
        await flushPromises();

        expect(h.result.config.apbsExe).toBe('/user/apbs');
        // pdb2pqr not persisted -> bundled default.
        expect(h.result.config.pdb2pqrExe).toBe(BUNDLED.pdb2pqrExe);
        h.unmount();
    });

    it('falls through to the compiled-in (empty) default when Main resolves empty', async () => {
        // Dev run without BUNDLE_APPS: Main returns empty paths -> not configured.
        const empty = { apbsExe: '', pdb2pqrExe: '' };
        setupChannels(undefined, { defaultApbsBinaries: empty });
        const h = makeRenderHook(() => useApbsConfig(), ApbsConfigProvider);
        await flushPromises();

        expect(h.result.config.apbsExe).toBe(DEFAULT_APBS_BINARIES.apbsExe);
        expect(h.result.config.apbsExe).toBe('');
        h.unmount();
    });

    it('setValue updates state and persists via UI_SAVE', async () => {
        const api = setupElectronAPI();
        const h = makeRenderHook(() => useApbsConfig(), ApbsConfigProvider);
        await flushPromises();

        act(() => h.result.setValue('apbsExe', '/opt/apbs'));

        expect(h.result.config.apbsExe).toBe('/opt/apbs');
        expect(api.invoke).toHaveBeenCalledWith(IPC.UI_SAVE, { apbsExe: '/opt/apbs' });
        h.unmount();
    });
});
