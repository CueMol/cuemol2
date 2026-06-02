/**
 * @file __test__/genericProps.test.ts
 * @description Contract tests for the generic property inspector worker
 * layer: the `getPropsJSON` parser and the get/set services.
 *
 * These pin the wire-level invariants so the internals can be refactored
 * without silent regressions:
 *   - parseGenericProps: JSON shape -> flat entry list
 *   - resolvePropTarget: node type -> correct wrapper lookup
 *   - setGenericProp: writes go through an undo transaction
 */

import { describe, it, expect, vi } from 'vitest';
import {
    parseGenericProps,
    CONTAINER_VALUE,
} from '../worker/server/services/helpers/parseGenericProps';
import { resolvePropTarget } from '../worker/server/services/helpers/resolvePropTarget';
import { services } from '../worker/server/services/genericProps.service';
import type { WorkerContext } from '../worker/server/types/WorkerContext';

// ── parseGenericProps ──────────────────────────────────────────────────────

describe('parseGenericProps', () => {
    const RAW = [
        { name: 'alpha', readonly: false, hasdefault: true, isdefault: false, type: 'real', value: 1 },
        { name: 'visible', readonly: false, hasdefault: false, type: 'boolean', value: true },
        {
            name: 'coil_type', readonly: false, hasdefault: true, isdefault: true,
            type: 'enum', enumdef: ['round', 'elliptical'], value: 'elliptical',
        },
        { name: 'center', readonly: true, hasdefault: false, type: 'object<Vector>', value: '(1,2,3)' },
        {
            name: 'coloring', readonly: false, hasdefault: false, type: 'object<ColoringScheme>',
            value: [{ name: 'x', readonly: false, hasdefault: false, type: 'real', value: 0 }],
        },
    ];

    it('flattens the JSON array into one entry per top-level property', () => {
        const entries = parseGenericProps(RAW);
        expect(entries.map((e) => e.key)).toEqual([
            'alpha', 'visible', 'coil_type', 'center', 'coloring',
        ]);
    });

    it('keeps primitive values typed and carries default flags', () => {
        const [alpha, visible] = parseGenericProps(RAW);
        expect(alpha).toMatchObject({ type: 'real', value: 1, hasdefault: true, isdefault: false });
        // isdefault is forced false when the property has no default.
        expect(visible).toMatchObject({ type: 'boolean', value: true, hasdefault: false, isdefault: false });
    });

    it('parses the emitted default value into defaultValue', () => {
        const raw = [
            { name: 'alpha', readonly: false, hasdefault: true, isdefault: false, default: 1, type: 'real', value: 0.5 },
            { name: 'visible', readonly: false, hasdefault: true, isdefault: true, default: true, type: 'boolean', value: true },
            { name: 'width', readonly: false, hasdefault: false, type: 'real', value: 2 },
        ];
        const [alpha, visible, width] = parseGenericProps(raw);
        expect(alpha.defaultValue).toBe(1);
        expect(visible.defaultValue).toBe(true);
        // No emitted default -> undefined.
        expect(width.defaultValue).toBeUndefined();
    });

    it('retains enumdef and isdefault for enum properties', () => {
        const coil = parseGenericProps(RAW).find((e) => e.key === 'coil_type')!;
        expect(coil.enumdef).toEqual(['round', 'elliptical']);
        expect(coil.isdefault).toBe(true);
    });

    it('keeps a string-convertible object property as a plain editable-less value', () => {
        const center = parseGenericProps(RAW).find((e) => e.key === 'center')!;
        expect(center.value).toBe('(1,2,3)');
        expect(center.isContainer).toBe(false);
        expect(center.readonly).toBe(true);
    });

    it('emits a nested object as a single read-only container row', () => {
        const coloring = parseGenericProps(RAW).find((e) => e.key === 'coloring')!;
        expect(coloring.isContainer).toBe(true);
        expect(coloring.value).toBe(CONTAINER_VALUE);
        // A nested object cannot be written generically yet -> forced readonly.
        expect(coloring.readonly).toBe(true);
    });

    it('returns an empty list for non-array input', () => {
        expect(parseGenericProps(null)).toEqual([]);
        expect(parseGenericProps({})).toEqual([]);
    });
});

// ── resolvePropTarget ──────────────────────────────────────────────────────

describe('resolvePropTarget', () => {
    function makeCtx() {
        const obj = { __obj: true };
        const rend = { __rend: true };
        const view = { __view: true };
        const scene = {
            getObject: vi.fn(() => obj),
            getRenderer: vi.fn(() => rend),
        };
        const getView = vi.fn(() => view);
        const ctx = {
            sceMgr: { getScene: vi.fn(() => scene), getView },
        } as unknown as WorkerContext;
        return { ctx, scene, obj, rend, view, getView };
    }

    it('resolves an object node via scene.getObject', () => {
        const { ctx, scene, obj } = makeCtx();
        const res = resolvePropTarget(ctx, { sceneId: 1, nodeId: 7, nodeType: 'object' });
        expect(scene.getObject).toHaveBeenCalledWith(7);
        expect(res.target).toBe(obj);
    });

    it('resolves renderer and rendGroup via scene.getRenderer', () => {
        const { ctx, scene, rend } = makeCtx();
        expect(resolvePropTarget(ctx, { sceneId: 1, nodeId: 3, nodeType: 'renderer' }).target).toBe(rend);
        expect(resolvePropTarget(ctx, { sceneId: 1, nodeId: 4, nodeType: 'rendGroup' }).target).toBe(rend);
        expect(scene.getRenderer).toHaveBeenCalledTimes(2);
    });

    it('resolves a scene node to the scene itself', () => {
        const { ctx, scene } = makeCtx();
        const res = resolvePropTarget(ctx, { sceneId: 1, nodeId: 1, nodeType: 'scene' });
        expect(res.target).toBe(scene);
    });

    it('resolves a view node via sceMgr.getView', () => {
        const { ctx, view, getView } = makeCtx();
        const res = resolvePropTarget(ctx, { sceneId: 1, nodeId: 8, nodeType: 'view' });
        expect(getView).toHaveBeenCalledWith(8);
        expect(res.target).toBe(view);
    });

    it('returns a null target for unsupported node types', () => {
        const { ctx } = makeCtx();
        expect(resolvePropTarget(ctx, { sceneId: 1, nodeId: 9, nodeType: 'camera' }).target).toBeNull();
        expect(resolvePropTarget(ctx, { sceneId: 1, nodeId: 9, nodeType: 'style' }).target).toBeNull();
    });
});

// ── genericProps services ──────────────────────────────────────────────────

describe('genericProps services', () => {
    const PROPS_JSON = JSON.stringify([
        { name: 'alpha', readonly: false, hasdefault: true, isdefault: false, type: 'real', value: 1 },
    ]);

    function makeEnv() {
        const target = {
            name: 'ribbon1',
            type_name: 'ribbon',
            getPropsJSON: vi.fn(() => PROPS_JSON),
            setProp: vi.fn(),
            resetProp: vi.fn(),
        };
        const viewTarget = {
            getPropsJSON: vi.fn(() => PROPS_JSON),
            setProp: vi.fn(),
            resetProp: vi.fn(),
        };
        const scene = {
            getRenderer: vi.fn(() => target),
            startUndoTxn: vi.fn(),
            commitUndoTxn: vi.fn(),
            rollbackUndoTxn: vi.fn(),
        };
        const ctx = {
            sceMgr: { getScene: vi.fn(() => scene), getView: vi.fn(() => viewTarget) },
        } as unknown as WorkerContext;
        return { ctx, scene, target, viewTarget };
    }

    const ref = { sceneId: 1, nodeId: 5, nodeType: 'renderer' as const };

    it('getGenericProps dumps and parses the wrapper property list', () => {
        const { ctx, target } = makeEnv();
        const res = services.getGenericProps(ctx, ref);
        expect(target.getPropsJSON).toHaveBeenCalled();
        expect(res.ok).toBe(true);
        expect(res.displayName).toBe('ribbon1');
        expect(res.typeLabel).toBe('ribbon');
        expect(res.entries.map((e) => e.key)).toEqual(['alpha']);
    });

    it('setGenericProp (set) writes via setProp inside an undo transaction', () => {
        const { ctx, scene, target } = makeEnv();
        const res = services.setGenericProp(ctx, {
            ...ref, propName: 'alpha', op: 'set', valueType: 'real', value: 0.5,
        });
        expect(scene.startUndoTxn).toHaveBeenCalledTimes(1);
        expect(target.setProp).toHaveBeenCalledWith('alpha', 0.5);
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1);
        expect(res.ok).toBe(true);
        // Returns the freshly re-dumped property list.
        expect(res.entries.map((e) => e.key)).toEqual(['alpha']);
    });

    it('setGenericProp (reset) calls resetProp, not setProp', () => {
        const { ctx, target } = makeEnv();
        const res = services.setGenericProp(ctx, {
            ...ref, propName: 'alpha', op: 'reset', valueType: '',
        });
        expect(target.resetProp).toHaveBeenCalledWith('alpha');
        expect(target.setProp).not.toHaveBeenCalled();
        expect(res.ok).toBe(true);
    });

    it('resetGenericProps resets every key inside ONE undo transaction', () => {
        const { ctx, scene, target } = makeEnv();
        const res = services.resetGenericProps(ctx, {
            ...ref, propNames: ['alpha', 'visible', 'width'],
        });
        // One transaction wraps all three resets (single undo step).
        expect(scene.startUndoTxn).toHaveBeenCalledTimes(1);
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1);
        expect(target.resetProp).toHaveBeenCalledTimes(3);
        expect(target.resetProp).toHaveBeenNthCalledWith(1, 'alpha');
        expect(target.resetProp).toHaveBeenNthCalledWith(2, 'visible');
        expect(target.resetProp).toHaveBeenNthCalledWith(3, 'width');
        expect(res.ok).toBe(true);
        expect(res.entries.map((e) => e.key)).toEqual(['alpha']);
    });

    it('resetGenericProps is a no-op for an empty key list', () => {
        const { ctx, scene, target } = makeEnv();
        const res = services.resetGenericProps(ctx, { ...ref, propNames: [] });
        expect(scene.startUndoTxn).not.toHaveBeenCalled();
        expect(target.resetProp).not.toHaveBeenCalled();
        expect(res.ok).toBe(false);
    });

    it('getGenericProps resolves a view and labels it View', () => {
        const { ctx, viewTarget } = makeEnv();
        const res = services.getGenericProps(ctx, { sceneId: 1, nodeId: 8, nodeType: 'view' });
        expect(viewTarget.getPropsJSON).toHaveBeenCalled();
        expect(res.ok).toBe(true);
        expect(res.typeLabel).toBe('View');
        expect(res.displayName).toBe('View');
    });

    it('reports failure when the node cannot be resolved', () => {
        const { ctx } = makeEnv();
        const res = services.setGenericProp(ctx, {
            ...ref, nodeType: 'camera', propName: 'alpha', op: 'set', valueType: 'real', value: 1,
        });
        expect(res.ok).toBe(false);
        expect(res.entries).toEqual([]);
    });
});
