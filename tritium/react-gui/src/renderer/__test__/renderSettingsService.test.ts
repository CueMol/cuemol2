/**
 * @file __test__/renderSettingsService.test.ts
 * @description Undo granularity of a scene render-settings write: one
 * transaction per write, only the keys that change are written, a value
 * equal to the declared default is a reset (so the file does not carry it),
 * and a write that changes nothing opens no transaction (an empty commit
 * would clear the user's redo stack). Reads of a scene without settings
 * come from a fresh object, the C++ defaults.
 */

import { describe, it, expect, vi } from 'vitest';
import { fakeScene, makeWorkerCtx } from '@renderer/worker/testing';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import {
    getSceneRenderSettings,
    setSceneRenderSettings,
} from '@renderer/worker/server/services/renderSettings/renderSettings.service';

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }));

type Value = string | number | boolean;

interface FakeBlock {
    props: Record<string, Value>;
    setProp: ReturnType<typeof vi.fn>;
    resetProp: ReturnType<typeof vi.fn>;
    hasProp: (key: string) => boolean;
    getProp: (key: string) => unknown;
    getPropsJSON: () => string;
}

/** A property bag in the C++ getPropsJSON shape, with declared defaults. */
function fakeBlock(defaults: Record<string, Value>, children: Record<string, FakeBlock> = {}): FakeBlock {
    const props: Record<string, Value> = { ...defaults };
    const setProp = vi.fn((key: string, value: Value) => {
        props[key] = value;
    });
    const resetProp = vi.fn((key: string) => {
        props[key] = defaults[key];
    });
    const obj: FakeBlock = {
        props,
        setProp,
        resetProp,
        hasProp: (key: string) => key in props || key in children,
        getProp: (key: string) => (key in children ? children[key] : props[key]),
        getPropsJSON: () =>
            JSON.stringify([
                ...Object.entries(props).map(([name, value]) => ({
                    name,
                    readonly: false,
                    hasdefault: true,
                    isdefault: value === defaults[name],
                    default: defaults[name],
                    type: typeof value === 'number' ? 'real' : typeof value,
                    value,
                })),
                ...Object.keys(children).map((name) => ({
                    name,
                    readonly: true,
                    hasdefault: false,
                    type: `object<${name}>`,
                    value: [],
                })),
            ]),
    };
    return obj;
}

/** A RenderSettings stand-in: common properties plus the umbreon block. */
function fakeRenderSettings() {
    const umbreon = fakeBlock({ aoSamples: 64, supersample: 3 });
    const parent = fakeBlock({ backend: '', width: 1200 }, { umbreon });
    return { parent, umbreon };
}

describe('renderSettings.service', () => {
    it('writes only what differs, resets a value back at its default, one transaction', () => {
        let stored: ReturnType<typeof fakeRenderSettings> | null = null;
        const scene = fakeScene({
            uid: 1,
            extra: {
                hasAppData: vi.fn(() => stored !== null),
                getAppData: vi.fn(() => stored?.parent),
                getCreateAppData: vi.fn(() => {
                    stored = fakeRenderSettings();
                    return stored.parent;
                }),
            },
        });
        const { ctx } = makeWorkerCtx({
            scenes: [scene],
            createObj: (className) => {
                expect(className).toBe('RenderSettings');
                return fakeRenderSettings().parent;
            },
        });
        const wctx = ctx as unknown as WorkerContext;

        // No settings yet: a fresh object's values and its defaults.
        expect(getSceneRenderSettings(wctx, { sceneId: 1 })).toEqual({
            ok: true,
            exists: false,
            values: { backend: '', width: 1200, 'umbreon.aoSamples': 64, 'umbreon.supersample': 3 },
            defaults: { backend: '', width: 1200, 'umbreon.aoSamples': 64, 'umbreon.supersample': 3 },
        });

        // First write: the holder is created inside the transaction; a key
        // already at the requested value is not written, a block key goes to
        // the child object, an unknown key is skipped.
        const r1 = setSceneRenderSettings(wctx, {
            sceneId: 1,
            values: { backend: '', width: 800, 'umbreon.aoSamples': 128, 'umbreon.supersample': 3, noSuchKey: 1 },
        });
        expect(r1.ok && r1.changed).toEqual(['width', 'umbreon.aoSamples']);
        expect(scene.undo.committed).toEqual(['Change render settings']);
        expect(stored!.parent.setProp.mock.calls).toEqual([['width', 800]]);
        expect(stored!.umbreon.setProp.mock.calls).toEqual([['aoSamples', 128]]);

        // The same values again: no transaction at all.
        const r2 = setSceneRenderSettings(wctx, {
            sceneId: 1,
            values: { backend: '', width: 800.0000001, 'umbreon.aoSamples': 128 },
        });
        expect(r2.ok && r2.changed).toEqual([]);
        expect(scene.undo.started).toHaveLength(1);

        // Back to the default: a reset, so the scene file drops the value.
        const r3 = setSceneRenderSettings(wctx, { sceneId: 1, values: { 'umbreon.aoSamples': 64 } });
        expect(r3.ok && r3.changed).toEqual(['umbreon.aoSamples']);
        expect(stored!.umbreon.resetProp).toHaveBeenCalledWith('aoSamples');
        expect(stored!.umbreon.setProp).toHaveBeenCalledTimes(1);
        expect(scene.undo.committed).toHaveLength(2);

        expect(getSceneRenderSettings(wctx, { sceneId: 1 })).toMatchObject({
            ok: true,
            exists: true,
            values: { width: 800, 'umbreon.aoSamples': 64 },
        });
    });
});
