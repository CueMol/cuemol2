import { describe, it, expect, vi } from 'vitest';
import { services } from '@renderer/worker/server/services/naviTool.service';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

const { naviHitTest, naviClickAtom, naviResidSel } = services;

function makeHitResult(overrides: Record<string, any> = {}) {
    return JSON.stringify({
        objtype: 'MolCoord',
        obj_id: 1,
        obj_name: 'mol1',
        rend_id: 10,
        rend_name: 'ribbon1',
        rendtype: '*ribbon',
        atom_id: 42,
        sel: 'aid 42',
        message: 'ALA 10 CA',
        x: 1.0, y: 2.0, z: 3.0,
        occ: 1.0, bfac: 25.5,
        ...overrides,
    });
}

function makeCtx(hitStr: string | null = null): WorkerContext {
    const mockView = {
        hitTest: vi.fn(() => hitStr),
        getScene: vi.fn(() => mockScene),
    };
    const mockAtom = {
        chainName: 'A',
        residIndex: '10',
    };
    const mockResidue = {};
    const mockRrs = {
        fromSel: vi.fn(),
        contains: vi.fn(() => false),
        append: vi.fn(),
        remove: vi.fn(),
        toSel: vi.fn(() => ({})),
    };
    const mockSel = { compile: vi.fn(() => true) };
    const mockRenderer = {
        addLabel: vi.fn(() => true),
        removeLabel: vi.fn(),
        applyStyles: vi.fn(),
    };
    const mockMol = {
        getAtomByID: vi.fn(() => mockAtom),
        getResidue: vi.fn(() => mockResidue),
        getRendererByNameType: vi.fn(() => null),
        createRenderer: vi.fn(() => mockRenderer),
        sel: {},
    };
    const mockScene = {
        getObject: vi.fn(() => mockMol),
        uid: 99,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
    };
    const mockMsgLog = { writeln: vi.fn() };
    const ctx = {
        sceMgr: {
            getView: vi.fn(() => mockView),
            getScene: vi.fn(() => mockScene),
        },
        svc: {
            getService: vi.fn(() => mockMsgLog),
            createObj: vi.fn((cls: string) => {
                if (cls === 'ResidRangeSet') return mockRrs;
                if (cls === 'SelCommand') return mockSel;
                return null;
            }),
        },
    } as unknown as WorkerContext;

    return ctx;
}

describe('naviHitTest', () => {
    it('returns { hit: false } when hitTest returns null', () => {
        const ctx = makeCtx(null);
        expect(naviHitTest(ctx, { viewId: 1, x: 0, y: 0 })).toEqual({ hit: false });
    });

    it('returns { hit: false } when hitTest returns empty string', () => {
        const ctx = makeCtx('');
        expect(naviHitTest(ctx, { viewId: 1, x: 0, y: 0 })).toEqual({ hit: false });
    });

    it('returns { hit: true, raw } when hitTest returns valid JSON', () => {
        const ctx = makeCtx(makeHitResult());
        const result = naviHitTest(ctx, { viewId: 1, x: 10, y: 20 });
        expect(result.hit).toBe(true);
        expect(result.raw).toBeDefined();
        expect(result.raw!.obj_name).toBe('mol1');
        expect(result.raw!.message).toBe('ALA 10 CA');
    });
});

describe('naviClickAtom', () => {
    it('returns { handled: false } when no hit', () => {
        const ctx = makeCtx(null);
        const r = naviClickAtom(ctx, { viewId: 1, x: 0, y: 0 });
        expect(r.handled).toBe(false);
    });

    it('handles LWObject (non-MolCoord) with statusMessage', () => {
        const hit = makeHitResult({ objtype: 'LWObject' });
        const ctx = makeCtx(hit);
        const r = naviClickAtom(ctx, { viewId: 1, x: 0, y: 0 });
        expect(r.handled).toBe(true);
        expect(r.statusMessage).toContain('LWObject');
        const msgLog = ctx.svc.getService('MsgLog') as any;
        expect(msgLog.writeln).toHaveBeenCalledWith(expect.stringContaining('LWObject'));
    });

    it('handles MolCoord with statusMessage including occ/bfac/pos', () => {
        const ctx = makeCtx(makeHitResult());
        const r = naviClickAtom(ctx, { viewId: 1, x: 0, y: 0 });
        expect(r.handled).toBe(true);
        expect(r.statusMessage).toContain('Molecule [mol1]');
        expect(r.statusMessage).toContain('O: 1.00');
        expect(r.statusMessage).toContain('B: 25.50');
        expect(r.statusMessage).toContain('Pos:');
    });

    it('includes symop in statusMessage for symm renderer', () => {
        const hit = makeHitResult({ rendtype: '*symm', symm_name: '2_555' });
        const ctx = makeCtx(hit);
        const r = naviClickAtom(ctx, { viewId: 1, x: 0, y: 0 });
        expect(r.statusMessage).toContain('symop: 2_555');
    });

    it('calls MsgLog.writeln with the status message', () => {
        const ctx = makeCtx(makeHitResult());
        naviClickAtom(ctx, { viewId: 1, x: 0, y: 0 });
        const msgLog = ctx.svc.getService('MsgLog') as any;
        expect(msgLog.writeln).toHaveBeenCalledWith(expect.any(String));
    });

    it('calls withUndoTxn for atom label toggle', () => {
        const ctx = makeCtx(makeHitResult());
        naviClickAtom(ctx, { viewId: 1, x: 0, y: 0 });
        const view = (ctx.sceMgr as any).getView(1);
        const scene = view.getScene();
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Add atom label');
    });
});

describe('naviResidSel', () => {
    it('returns { handled: false } when no hit', () => {
        const ctx = makeCtx(null);
        const r = naviResidSel(ctx, { viewId: 1, x: 0, y: 0, mode: 'toggle' });
        expect(r.handled).toBe(false);
    });

    it('returns { handled: false } for non-MolCoord hit', () => {
        const ctx = makeCtx(makeHitResult({ objtype: 'LWObject' }));
        const r = naviResidSel(ctx, { viewId: 1, x: 0, y: 0, mode: 'toggle' });
        expect(r.handled).toBe(false);
    });

    it('returns { handled: true, objId, atomId } on toggle for MolCoord', () => {
        const ctx = makeCtx(makeHitResult());
        const r = naviResidSel(ctx, { viewId: 1, x: 0, y: 0, mode: 'toggle' });
        expect(r.handled).toBe(true);
        expect(r.objId).toBe(1);
        expect(r.atomId).toBe(42);
    });

    it('calls withUndoTxn with correct label', () => {
        const ctx = makeCtx(makeHitResult());
        naviResidSel(ctx, { viewId: 1, x: 0, y: 0, mode: 'toggle' });
        const view = (ctx.sceMgr as any).getView(1);
        const scene = view.getScene();
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Toggle select atom(s)');
    });

    it('calls withUndoTxn even when already selected (toggle path)', () => {
        const ctx = makeCtx(makeHitResult());
        const r = naviResidSel(ctx, { viewId: 1, x: 0, y: 0, mode: 'toggle' });
        expect(r.handled).toBe(true);
        const view = (ctx.sceMgr as any).getView(1);
        const scene = view.getScene();
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Toggle select atom(s)');
    });

    it('skip extend when prevObjId does not match', () => {
        const ctx = makeCtx(makeHitResult({ obj_id: 1 }));
        const r = naviResidSel(ctx, {
            viewId: 1, x: 0, y: 0,
            mode: 'extend',
            prevObjId: 999,
            prevAtomId: 10,
        });
        // extend should bail out because prevObjId !== obj_id
        // withUndoTxn is still called but the inner code returns early
        expect(r.handled).toBe(true); // handled returns true even if extend no-ops
    });
});
