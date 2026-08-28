/**
 * @file renderer/worker/testing/fakes.test.ts
 * @description Pins the harness contracts other tests lean on: accessor
 * spies, the C++ JSON shapes, undo bookkeeping and manager resolution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseSceneTreeJSON } from '../shared/sceneTreeTypes';
import {
    fakeCamera, fakeObject, fakeRenderer, fakeScene, fakeView, makeWorkerCtx, resetFakeUids,
} from './index';

beforeEach(() => resetFakeUids());

describe('accessor spies', () => {
    it('record the assignment, store the value and log it in order', () => {
        const log: string[] = [];
        const rend = fakeRenderer({ name: 'r0', log });
        rend.name = 'r1';
        rend.sel = { __sel: true };
        expect(rend.sets.name).toHaveBeenCalledWith('r1');
        expect(rend.name).toBe('r1');
        expect(rend.sets.sel).toHaveBeenCalledTimes(1);
        expect(log).toEqual(['rend.name=r1', 'rend.sel={"__sel":true}']);
    });

    it('setProp / resetProp drive the generic-prop store', () => {
        const rend = fakeRenderer({ props: { alpha: 0.5 } });
        expect(rend.isPropDefault('alpha')).toBe(false);
        rend.setProp('width', 2);
        expect(rend.getProp('width')).toBe(2);
        rend.resetProp('alpha');
        expect(rend.hasProp('alpha')).toBe(false);
    });
});

describe('object / renderer wiring', () => {
    it('createRenderer attaches the renderer so scene lookups find it', () => {
        const log: string[] = [];
        const mol = fakeObject({ name: 'mol', log });
        const scene = fakeScene({ objects: [mol] });
        const rend = mol.createRenderer('cartoon')!;
        expect(mol.getRendererByType('cartoon')).toBe(rend);
        expect(scene.getRenderer(rend.uid)).toBe(rend);
        expect(rend.getClientObj()).toBe(mol);
        expect(rend.getScene()).toBe(scene);
        expect(mol.rend_uids).toBe(String(rend.uid));
        expect(log).toEqual(['mol.createRenderer(cartoon)']);
    });

    it('rendererDefaults shape the renderers an object creates', () => {
        const mol = fakeObject({ rendererDefaults: { hasCenter: false } });
        const rend = mol.createRenderer('simple')!;
        expect('getCenter' in rend).toBe(false);
    });

    it('createView attaches a view the scene resolves, and clearAllData spares it', () => {
        const scene = fakeScene({ objects: [fakeObject({ name: 'mol' })], cameras: [fakeCamera({ name: 'cam' })] });
        const view = scene.createView();
        expect(scene.getView(view.uid)).toBe(view);
        expect(view.getScene()).toBe(scene);
        expect(scene.view_uids).toBe(String(view.uid));

        // Mirrors C++ Scene::clearAllData: objects, renderers, cameras and the
        // undo history go; the view table survives.
        scene.startUndoTxn('edit');
        scene.commitUndoTxn();
        scene.clearAllData();
        expect(scene.objects).toHaveLength(0);
        expect(scene.cameras).toHaveLength(0);
        expect(scene.undo.committed).toHaveLength(0);
        expect(scene.views).toEqual([view]);
    });

    it('a mol-like class gets fitView, a map does not', () => {
        expect(typeof fakeObject({ className: 'PDBMol' }).fitView).toBe('function');
        expect('fitView' in fakeObject({ className: 'DensityMap' })).toBe(false);
    });
});

describe('getSceneDataJSON / getCameraInfoJSON', () => {
    it('produce the documented C++ shapes, groups via childNodes', () => {
        const grp = fakeRenderer({ uid: 30, type: '*group', name: 'g' });
        const member = fakeRenderer({ uid: 31, type: 'cartoon', name: 'c', group: 'g' });
        const top = fakeRenderer({ uid: 32, type: 'simple', name: 's' });
        const mol = fakeObject({ uid: 3, name: 'mol', renderers: [grp, member, top] });
        const scene = fakeScene({ uid: 100, name: 'sc', objects: [mol], cameras: [fakeCamera({ name: 'cam', visSize: 2 })] });

        const raw = JSON.parse(scene.getSceneDataJSON()) as Array<Record<string, unknown>>;
        expect(raw[0]).toMatchObject({ ID: 100, name: 'sc', type: '' });
        expect(raw[1]).toMatchObject({ ID: 3, name: 'mol', type: 'MolCoord', visible: true });
        const rends = raw[1].rends as Array<Record<string, unknown>>;
        // A grouped member is not at the top level; it hangs off the group.
        expect(rends.map((r) => r.ID)).toEqual([30, 32]);
        expect((rends[0].childNodes as Array<Record<string, unknown>>).map((r) => r.ID)).toEqual([31]);
        expect('childNodes' in rends[1]).toBe(false);

        expect(JSON.parse(scene.getCameraInfoJSON())).toEqual([{ name: 'cam', vis_size: 2, src: '' }]);
    });

    it('is accepted by the production parser', () => {
        const mol = fakeObject({ uid: 3, name: 'mol', renderers: [fakeRenderer({ uid: 31, type: 'cartoon', name: 'c' })] });
        const tree = parseSceneTreeJSON(fakeScene({ uid: 100, objects: [mol] }).getSceneDataJSON());
        expect(tree?.children[0].children[0]).toMatchObject({ id: 31, type: 'renderer', className: 'cartoon' });
    });
});

describe('undo bookkeeping', () => {
    it('tracks started / committed / rolled-back labels', () => {
        const scene = fakeScene();
        scene.startUndoTxn('A');
        scene.commitUndoTxn();
        scene.startUndoTxn('B');
        scene.rollbackUndoTxn();
        expect(scene.undo).toEqual({ started: ['A', 'B'], committed: ['A'], rolledBack: ['B'], open: null });
        expect(scene.isUndoable()).toBe(true);
    });
});

describe('makeWorkerCtx', () => {
    it('resolves scenes, views, objects and renderers from the fakes', () => {
        const rend = fakeRenderer({ uid: 31 });
        const mol = fakeObject({ uid: 3, renderers: [rend] });
        const view = fakeView({ uid: 7 });
        const scene = fakeScene({ uid: 100, objects: [mol], views: [view] });
        const { ctx, sceMgr } = makeWorkerCtx({ scenes: [scene] });
        expect(ctx.sceMgr.getScene(100)).toBe(scene);
        expect(ctx.sceMgr.getScene(1)).toBeNull();
        expect(ctx.sceMgr.getView(7)).toBe(view);
        expect(view.getScene()).toBe(scene);
        expect(sceMgr.getObject(3)).toBe(mol);
        expect(sceMgr.getRenderer(31)).toBe(rend);
        expect(sceMgr.scene_uids).toBe('100');
    });

    it('serves readers, reader info, commands, styles and services from the tables', () => {
        const reader = { read: () => undefined };
        const cmd = { run: () => undefined };
        const { ctx } = makeWorkerCtx({
            readers: { pdb: reader },
            readerInfo: [{ name: 'pdb', fext: '*.pdb', category: 0 }, { name: 'qsc_xml', fext: '*.qsc', category: 2 }],
            cmds: { load_object: cmd },
            styleNames: { 0: ['DefaultCPKColoring'] },
            getService: (name) => (name === 'MolAnlManager' ? { anl: true } : undefined),
        });
        expect(ctx.strMgr.createHandler('pdb', 0)).toBe(reader);
        expect(ctx.strMgr.createHandler('nope', 0)).toBeNull();
        expect(JSON.parse(ctx.strMgr.getInfoJSON2())).toHaveLength(2);
        expect(ctx.cmdMgr.getCmd('load_object')).toBe(cmd);
        expect(() => ctx.cmdMgr.getCmd('new_renderer')).toThrow(/no fake command/);
        expect(JSON.parse(ctx.styleMgr.getStyleNamesJSON(0))).toEqual([{ name: 'DefaultCPKColoring' }]);
        expect(ctx.svc.getService('MolAnlManager')).toEqual({ anl: true });
        expect(ctx.svc.getService('Other')).toBeNull();
        expect(() => ctx.svc.createObj('Vector')).toThrow(/createObj/);
    });
});
