/**
 * @file __test__/measureService.test.ts
 * @description Pins the observable contract of the measure (distance / angle /
 * torsion) worker services: the pick state machine, the create-or-reuse +
 * undo-wrapped label creation, the degenerate guard, the crosshair feedback
 * lifecycle, reset, and the target listing.
 *
 * Wrappers are mocked as plain objects whose accessors record assignments
 * (CLAUDE.md worker-service test pattern). withUndoTxn runs for real so the
 * transaction label / commit / rollback are exercised against the spied scene.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { services } from '@renderer/worker/server/services/measure.service';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

type MeasureMode = 'distance' | 'angle' | 'torsion';

function makeHit(objId: number, atomId: number): string {
    return JSON.stringify({
        objtype: 'MolCoord',
        obj_id: objId,
        atom_id: atomId,
        obj_name: 'mol',
        message: `ATOM ${atomId}`,
        occ: 1,
        bfac: 0,
        x: 0,
        y: 0,
        z: 0,
    });
}

function makeHarness({ existing = false }: { existing?: boolean } = {}) {
    const s = {
        enabled: vi.fn<(v: boolean) => void>(),
        dappend: vi.fn(),
        invalidate: vi.fn(),
        startUndo: vi.fn(),
        commitUndo: vi.fn(),
        rollbackUndo: vi.fn(),
        createRenderer: vi.fn(),
        setName: vi.fn(),
        applyStyles: vi.fn(),
        appendById: vi.fn(),
        appendAngle: vi.fn(),
        appendTorsion: vi.fn(),
        writeln: vi.fn(),
        sceneJSON: vi.fn(() => '[]'),
    };

    const rend = {
        set name(v: string) {
            s.setName(v);
        },
        applyStyles: (x: string) => s.applyStyles(x),
        appendById: (...a: unknown[]) => s.appendById(...a),
        appendAngleById: (...a: unknown[]) => s.appendAngle(...a),
        appendTorsionById: (...a: unknown[]) => s.appendTorsion(...a),
    };

    const mol = {
        getRendererByNameType: vi.fn(() => (existing ? rend : null)),
        getRendererByType: vi.fn(() => null),
        createRenderer: vi.fn(() => {
            s.createRenderer();
            return rend;
        }),
    };

    const dobj = {
        set enabled(v: boolean) {
            s.enabled(v);
        },
        append: (...a: unknown[]) => s.dappend(...a),
    };

    const scene = {
        startUndoTxn: (l: string) => s.startUndo(l),
        commitUndoTxn: () => s.commitUndo(),
        rollbackUndoTxn: () => s.rollbackUndo(),
        getObject: vi.fn(() => mol),
        getSceneDataJSON: s.sceneJSON,
    };

    let hits: (string | null)[] = [];
    const view = {
        hitTest: vi.fn(() => hits.shift() ?? null),
        getScene: () => scene,
        getDrawObj: vi.fn(() => dobj),
        invalidate: () => s.invalidate(),
    };

    const ctx = {
        sceMgr: { getView: vi.fn(() => view) },
        svc: { getService: vi.fn(() => ({ writeln: s.writeln })) },
    } as unknown as WorkerContext;

    return { ctx, s, mol, scene, view, setHits: (h: (string | null)[]) => { hits = h; } };
}

// Unique view id per test so the module-level pick buffer never collides.
let vid = 100;
beforeEach(() => {
    vid += 1;
});

function pick(ctx: WorkerContext, viewId: number, mode: MeasureMode, target = '') {
    return services.measurePick(ctx, { viewId, x: 0, y: 0, mode, target });
}

describe('measurePick - distance', () => {
    it('creates a named atomintr renderer and appends in undo txn after 2 picks', () => {
        const h = makeHarness({ existing: false });
        h.setHits([makeHit(10, 1), makeHit(10, 2)]);

        const r1 = pick(h.ctx, vid, 'distance');
        expect(r1).toMatchObject({ handled: true, picked: 1 });
        expect(r1.done).toBeFalsy();
        expect(h.s.dappend).toHaveBeenCalledWith(10, 1);

        const r2 = pick(h.ctx, vid, 'distance');
        expect(r2).toMatchObject({ handled: true, done: true, picked: 0 });

        // create -> name -> applyStyles -> appendById, all inside the txn.
        expect(h.mol.createRenderer).toHaveBeenCalledWith('atomintr');
        expect(h.s.setName).toHaveBeenCalledWith('measure');
        expect(h.s.applyStyles).toHaveBeenCalledWith('DefaultLabel,DefaultAtomIntr');
        expect(h.s.appendById).toHaveBeenCalledWith(1, 10, 2, true);
        expect(h.s.startUndo).toHaveBeenCalledWith('Define Distance Label');
        expect(h.s.commitUndo).toHaveBeenCalledTimes(1);
        expect(h.s.rollbackUndo).not.toHaveBeenCalled();

        const order = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0];
        expect(order(h.s.startUndo)).toBeLessThan(order(h.mol.createRenderer));
        expect(order(h.mol.createRenderer)).toBeLessThan(order(h.s.setName));
        expect(order(h.s.setName)).toBeLessThan(order(h.s.applyStyles));
        expect(order(h.s.applyStyles)).toBeLessThan(order(h.s.appendById));
        expect(order(h.s.appendById)).toBeLessThan(order(h.s.commitUndo));

        // crosshair cleared after completion.
        expect(h.s.enabled).toHaveBeenLastCalledWith(false);
    });

    it('reuses an existing named renderer without create/applyStyles', () => {
        const h = makeHarness({ existing: true });
        h.setHits([makeHit(10, 1), makeHit(10, 2)]);

        pick(h.ctx, vid, 'distance', 'sites');
        pick(h.ctx, vid, 'distance', 'sites');

        expect(h.mol.getRendererByNameType).toHaveBeenCalledWith('sites', 'atomintr');
        expect(h.mol.createRenderer).not.toHaveBeenCalled();
        expect(h.s.applyStyles).not.toHaveBeenCalled();
        expect(h.s.appendById).toHaveBeenCalledWith(1, 10, 2, true);
    });

    it('uses "measure" as the default name when target is empty', () => {
        const h = makeHarness({ existing: false });
        h.setHits([makeHit(10, 1), makeHit(10, 2)]);
        pick(h.ctx, vid, 'distance', '');
        pick(h.ctx, vid, 'distance', '');
        expect(h.mol.getRendererByNameType).toHaveBeenCalledWith('measure', 'atomintr');
        expect(h.s.setName).toHaveBeenCalledWith('measure');
    });

    it('cancels a same-atom pick without starting a transaction', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 5), makeHit(10, 5)]);
        pick(h.ctx, vid, 'distance');
        const r = pick(h.ctx, vid, 'distance');
        expect(r.done).toBe(true);
        expect(r.statusMessage).toMatch(/cancel/i);
        expect(h.s.startUndo).not.toHaveBeenCalled();
        expect(h.s.appendById).not.toHaveBeenCalled();
    });
});

describe('measurePick - angle / torsion', () => {
    it('angle: appendAngleById with the second pick as the vertex', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1), makeHit(11, 2), makeHit(12, 3)]);
        pick(h.ctx, vid, 'angle');
        pick(h.ctx, vid, 'angle');
        const r = pick(h.ctx, vid, 'angle');
        expect(r.done).toBe(true);
        expect(h.s.appendAngle).toHaveBeenCalledWith(1, 11, 2, 12, 3);
        expect(h.s.startUndo).toHaveBeenCalledWith('Define Angle Label');
        // renderer created on the first pick's molecule.
        expect(h.scene.getObject).toHaveBeenCalledWith(10);
    });

    it('torsion: appendTorsionById with all four atoms in order', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1), makeHit(11, 2), makeHit(12, 3), makeHit(13, 4)]);
        pick(h.ctx, vid, 'torsion');
        pick(h.ctx, vid, 'torsion');
        pick(h.ctx, vid, 'torsion');
        const r = pick(h.ctx, vid, 'torsion');
        expect(r.done).toBe(true);
        expect(h.s.appendTorsion).toHaveBeenCalledWith(1, 11, 2, 12, 3, 13, 4);
        expect(h.s.startUndo).toHaveBeenCalledWith('Define Torsion Label');
    });
});

describe('measurePick - feedback / non-hits', () => {
    it('enables the draw object and appends a crosshair on each pick', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1)]);
        pick(h.ctx, vid, 'distance');
        expect(h.view.getDrawObj).toHaveBeenCalledWith('DistPickDrawObj');
        expect(h.s.enabled).toHaveBeenCalledWith(true);
        expect(h.s.dappend).toHaveBeenCalledWith(10, 1);
    });

    it('ignores a click that does not hit a molecule', () => {
        const h = makeHarness();
        h.setHits([null]);
        const r = pick(h.ctx, vid, 'distance');
        expect(r).toMatchObject({ handled: false, picked: 0 });
        expect(h.s.dappend).not.toHaveBeenCalled();
    });
});

describe('measureReset', () => {
    it('clears an in-progress sequence and reports it', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1)]);
        pick(h.ctx, vid, 'distance');

        const r = services.measureReset(h.ctx, { viewId: vid });
        expect(r).toEqual({ ok: true, cleared: true });
        expect(h.s.enabled).toHaveBeenLastCalledWith(false);

        const r2 = services.measureReset(h.ctx, { viewId: vid });
        expect(r2).toEqual({ ok: true, cleared: false });
    });
});

describe('measureListTargets', () => {
    it('returns unique sorted atomintr renderer names, recursing into groups', () => {
        const h = makeHarness();
        h.s.sceneJSON.mockReturnValue(
            JSON.stringify([
                { ID: 0, type: '' },
                {
                    ID: 1,
                    type: 'MolCoord',
                    rends: [
                        { ID: 2, type: 'simple', name: 'cartoon' },
                        { ID: 3, type: 'atomintr', name: 'sites' },
                        {
                            ID: 4,
                            type: 'group',
                            name: 'grp',
                            childNodes: [{ ID: 5, type: 'atomintr', name: 'measure' }],
                        },
                    ],
                },
            ]),
        );
        const r = services.measureListTargets(h.ctx, { viewId: vid });
        expect(r.names).toEqual(['measure', 'sites']);
    });

    it('returns an empty list on malformed scene JSON', () => {
        const h = makeHarness();
        h.s.sceneJSON.mockReturnValue('not json');
        expect(services.measureListTargets(h.ctx, { viewId: vid }).names).toEqual([]);
    });
});
