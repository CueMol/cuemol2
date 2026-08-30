/**
 * @file __test__/bondEditService.test.ts
 * @description Pins the observable contract of the bond-editor worker services:
 * the two-pick add gesture (first pick remembered; second pick creates a bond),
 * the same-molecule and self-bond guards (neither enforced by C++, so the worker
 * must reject them), the undo-wrapped makeBond, batched removeBond, and the
 * nonstd-bond list parsing.
 *
 * Wrappers are mocked as plain objects whose accessors record assignments
 * (CLAUDE.md worker-service test pattern). withUndoTxn runs for real so the
 * transaction label / commit / rollback are exercised against the spied scene.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { services } from '@renderer/worker/server/services/navi/navi.service';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

function makeHit(objId: number, atomId: number): string {
    return JSON.stringify({
        objtype: 'MolCoord',
        obj_id: objId,
        atom_id: atomId,
        obj_name: 'mol',
        message: `ATOM ${atomId}`,
    });
}

function makeHarness({ bondsJSON = '[]' }: { bondsJSON?: string } = {}) {
    const s = {
        enabled: vi.fn<(v: boolean) => void>(),
        dappend: vi.fn(),
        invalidate: vi.fn(),
        startUndo: vi.fn(),
        commitUndo: vi.fn(),
        rollbackUndo: vi.fn(),
        makeBond: vi.fn(),
        removeBond: vi.fn(),
        nostdJSON: vi.fn(() => bondsJSON),
        writeln: vi.fn(),
    };

    const mol = { __mol: true };

    const mgr = {
        makeBond: (...a: unknown[]) => s.makeBond(...a),
        removeBond: (...a: unknown[]) => s.removeBond(...a),
        getNostdBondsJSON: () => s.nostdJSON(),
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
    };

    let hits: (string | null)[] = [];
    const view = {
        hitTest: vi.fn(() => hits.shift() ?? null),
        getScene: () => scene,
        getDrawObj: vi.fn(() => dobj),
        invalidate: () => s.invalidate(),
    };

    const ctx = {
        sceMgr: {
            getView: vi.fn(() => view),
            getScene: vi.fn(() => scene),
        },
        svc: {
            getService: vi.fn((name: string) => (name === 'MolAnlManager' ? mgr : { writeln: s.writeln })),
        },
    } as unknown as WorkerContext;

    return { ctx, s, mol, scene, view, setHits: (h: (string | null)[]) => { hits = h; } };
}

// Unique view id per test so the module-level pick buffer never collides.
let vid = 200;
beforeEach(() => {
    vid += 1;
});

function pick(ctx: WorkerContext, viewId: number) {
    return services.bondEditPick(ctx, { viewId, x: 0, y: 0 });
}

describe('bondEditPick - add bond', () => {
    it('remembers the first pick and creates a bond on the second (one undo txn)', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1), makeHit(10, 2)]);

        const r1 = pick(h.ctx, vid);
        expect(r1).toMatchObject({ handled: true, picked: 1 });
        expect(r1.done).toBeFalsy();
        expect(h.s.dappend).toHaveBeenCalledWith(10, 1);
        expect(h.s.makeBond).not.toHaveBeenCalled();

        const r2 = pick(h.ctx, vid);
        expect(r2).toMatchObject({ handled: true, done: true, picked: 0 });

        // makeBond(mol, aid1, aid2) inside the txn; renderer reads the first mol.
        expect(h.scene.getObject).toHaveBeenCalledWith(10);
        expect(h.s.makeBond).toHaveBeenCalledWith(h.mol, 1, 2);
        expect(h.s.startUndo).toHaveBeenCalledWith('Add bond');
        expect(h.s.commitUndo).toHaveBeenCalledTimes(1);
        expect(h.s.rollbackUndo).not.toHaveBeenCalled();

        const order = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0];
        expect(order(h.s.startUndo)).toBeLessThan(order(h.s.makeBond));
        expect(order(h.s.makeBond)).toBeLessThan(order(h.s.commitUndo));

        // crosshair cleared after completion.
        expect(h.s.enabled).toHaveBeenLastCalledWith(false);
    });

    it('rejects a second pick in a different molecule, keeping the first pick', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1), makeHit(11, 2)]);
        pick(h.ctx, vid);
        const r = pick(h.ctx, vid);
        expect(r).toMatchObject({ handled: true, picked: 1 });
        expect(r.done).toBeFalsy();
        expect(r.statusMessage).toMatch(/same molecule/i);
        expect(h.s.makeBond).not.toHaveBeenCalled();
        expect(h.s.startUndo).not.toHaveBeenCalled();
    });

    it('rejects bonding an atom to itself, keeping the first pick', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 5), makeHit(10, 5)]);
        pick(h.ctx, vid);
        const r = pick(h.ctx, vid);
        expect(r).toMatchObject({ handled: true, picked: 1 });
        expect(r.statusMessage).toMatch(/itself/i);
        expect(h.s.makeBond).not.toHaveBeenCalled();
    });

    it('rolls back and reports failure when makeBond throws', () => {
        const h = makeHarness();
        h.s.makeBond.mockImplementation(() => {
            throw new Error('removeBond: failed');
        });
        h.setHits([makeHit(10, 1), makeHit(10, 2)]);
        pick(h.ctx, vid);
        const r = pick(h.ctx, vid);
        expect(r).toMatchObject({ handled: true, done: true, picked: 0 });
        expect(r.statusMessage).toMatch(/failed/i);
        // Mislabeled C++ message must not leak through.
        expect(r.statusMessage).not.toMatch(/removeBond/);
        expect(h.s.rollbackUndo).toHaveBeenCalledTimes(1);
        expect(h.s.commitUndo).not.toHaveBeenCalled();
    });

    it('ignores a click that does not hit a molecule (first pick kept)', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1), null]);
        pick(h.ctx, vid);
        const r = pick(h.ctx, vid);
        expect(r).toMatchObject({ handled: false, picked: 1 });
        expect(h.s.makeBond).not.toHaveBeenCalled();
    });
});

describe('bondEditReset', () => {
    it('clears an in-progress first pick and reports it', () => {
        const h = makeHarness();
        h.setHits([makeHit(10, 1)]);
        pick(h.ctx, vid);

        const r = services.bondEditReset(h.ctx, { viewId: vid });
        expect(r).toEqual({ ok: true, cleared: true });
        expect(h.s.enabled).toHaveBeenLastCalledWith(false);

        const r2 = services.bondEditReset(h.ctx, { viewId: vid });
        expect(r2).toEqual({ ok: true, cleared: false });
    });
});

describe('bondEditRemoveBond', () => {
    it('removes every pair inside a single undo transaction', () => {
        const h = makeHarness();
        const r = services.bondEditRemoveBond(h.ctx, {
            sceneId: 1,
            molId: 10,
            pairs: [[1, 2], [3, 4]],
        });
        expect(r).toEqual({ ok: true, removed: 2 });
        expect(h.s.startUndo).toHaveBeenCalledTimes(1);
        expect(h.s.startUndo).toHaveBeenCalledWith('Remove bond(s)');
        expect(h.s.commitUndo).toHaveBeenCalledTimes(1);
        expect(h.s.removeBond).toHaveBeenNthCalledWith(1, h.mol, 1, 2);
        expect(h.s.removeBond).toHaveBeenNthCalledWith(2, h.mol, 3, 4);
    });

    it('is a no-op (no txn) for an empty pair list', () => {
        const h = makeHarness();
        const r = services.bondEditRemoveBond(h.ctx, { sceneId: 1, molId: 10, pairs: [] });
        expect(r).toEqual({ ok: true, removed: 0 });
        expect(h.s.startUndo).not.toHaveBeenCalled();
    });
});

describe('bondEditListBonds', () => {
    it('parses getNostdBondsJSON into atom pairs', () => {
        const bondsJSON = JSON.stringify([
            [
                { aid: 1, chain: 'A', resid: '5', resn: 'GLY', aname: 'CA' },
                { aid: 2, chain: 'A', resid: '6', resn: 'ALA', aname: 'N' },
            ],
        ]);
        const h = makeHarness({ bondsJSON });
        const r = services.bondEditListBonds(h.ctx, { sceneId: 1, molId: 10 });
        expect(r.bonds).toHaveLength(1);
        expect(r.bonds[0][0]).toMatchObject({ aid: 1, aname: 'CA', resid: '5' });
        expect(r.bonds[0][1]).toMatchObject({ aid: 2, aname: 'N' });
    });

    it('returns an empty list on malformed JSON', () => {
        const h = makeHarness({ bondsJSON: 'not json' });
        expect(services.bondEditListBonds(h.ctx, { sceneId: 1, molId: 10 }).bonds).toEqual([]);
    });
});
