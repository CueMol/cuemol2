/**
 * @file __test__/useSceneSettingsSync.test.ts
 * @description The Rendering window's editor follows the target scene and
 * writes only the user's edits back: a load never writes, a burst of edits is
 * one write with the final values, and a change push is applied unless it is
 * this window's own echo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { makeRenderHook, flushPromises } from '@renderer/__test__/helpers/testHarness';
import { useRenderSettings } from '@renderer/features/render/useRenderSettings';
import { useSceneSettingsSync } from '@renderer/features/render/renderwindow/useSceneSettingsSync';
import { PERSIST_DEBOUNCE_MS } from '@renderer/utils/timing';
import type { RenderSettingsValues } from '@renderer/worker/shared/renderSettingsValues';
import type { SceneSettingsPush } from '@renderer/features/render/useRenderWindowClient';
import { RENDER_SETTINGS_DEFAULTS } from '@renderer/__test__/fixtures/renderSettingsValues';

const valueOf = (props: { key: string; value: unknown }[], key: string) =>
    props.find((p) => p.key === key)?.value;

/** The render-window client as the sync hook sees it. */
function makeClient() {
    const stored = new Map<number, RenderSettingsValues>();
    return {
        state: { sceneSettings: null as SceneSettingsPush | null },
        // A scene without settings answers with a fresh object's values.
        getSceneRenderSettings: vi.fn(async (sceneId: number) =>
            stored.has(sceneId)
                ? { ok: true as const, exists: true, values: stored.get(sceneId)!, defaults: RENDER_SETTINGS_DEFAULTS }
                : { ok: true as const, exists: false, values: RENDER_SETTINGS_DEFAULTS, defaults: RENDER_SETTINGS_DEFAULTS },
        ),
        writeSceneRenderSettings: vi.fn((sceneId: number, values: RenderSettingsValues) => {
            stored.set(sceneId, { ...RENDER_SETTINGS_DEFAULTS, ...values });
        }),
    };
}

// The debounced write is caught by intercepting only its own timer; every
// other setTimeout (the harness' promise flushing) runs for real.
const realSetTimeout = globalThis.setTimeout;
let pendingWrites: Array<() => void> = [];

beforeEach(() => {
    pendingWrites = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
        if (ms === PERSIST_DEBOUNCE_MS) {
            pendingWrites.push(cb);
            return 0 as never;
        }
        return realSetTimeout(cb, ms);
    }) as never);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useSceneSettingsSync', () => {
    it('loads the target scene without writing, and writes a burst of edits once', async () => {
        const client = makeClient();
        const h = makeRenderHook(() => {
            const settings = useRenderSettings();
            const sync = useSceneSettingsSync({
                client: client as never,
                settings,
                targetSceneId: 1,
                umbreonAvailable: true,
            });
            return { settings, sync };
        });
        await flushPromises();
        expect(client.getSceneRenderSettings).toHaveBeenCalledWith(1);
        expect(client.writeSceneRenderSettings).not.toHaveBeenCalled();
        expect(pendingWrites).toEqual([]);

        act(() => h.result.settings.handleChange('width', 800));
        act(() => h.result.settings.handleChange('width', 900));
        expect(client.writeSceneRenderSettings).not.toHaveBeenCalled();
        act(() => pendingWrites[pendingWrites.length - 1]());
        expect(client.writeSceneRenderSettings).toHaveBeenCalledTimes(1);
        const [sceneId, values] = client.writeSceneRenderSettings.mock.calls[0];
        expect(sceneId).toBe(1);
        expect(values.width).toBe(900);
        // The backend was never chosen, so it is not stored as chosen.
        expect(values.backend).toBe('');
        expect(values['umbreon.aoSamples']).toBe(64);

        // The scene's echo of that write changes nothing; a different push
        // replaces the editor state and is not written back.
        const written = pendingWrites.length;
        const full = { ...RENDER_SETTINGS_DEFAULTS, ...values };
        client.state = {
            sceneSettings: { sceneId: 1, exists: true, values: full, defaults: RENDER_SETTINGS_DEFAULTS, seq: 1 },
        };
        act(() => h.rerender());
        expect(valueOf(h.result.settings.commonProps, 'width')).toBe(900);
        client.state = {
            sceneSettings: {
                sceneId: 1, exists: true, values: { ...full, width: 700 }, defaults: RENDER_SETTINGS_DEFAULTS, seq: 2,
            },
        };
        act(() => h.rerender());
        expect(valueOf(h.result.settings.commonProps, 'width')).toBe(700);
        expect(pendingWrites).toHaveLength(written);
        expect(client.writeSceneRenderSettings).toHaveBeenCalledTimes(1);
        h.unmount();
    });
});
