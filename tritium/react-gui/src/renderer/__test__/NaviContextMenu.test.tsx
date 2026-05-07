import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useNaviContextMenu } from '../hooks/useNaviContextMenu';
import { IPC } from '../../shared/ipcChannels';

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }));

const mockCm = {
    naviCenterAt: vi.fn().mockResolvedValue({ ok: true }),
    naviCenterAtSymm: vi.fn().mockResolvedValue({ ok: true }),
    naviCtxSelect: vi.fn().mockResolvedValue({ ok: true }),
    naviCtxAddSelect: vi.fn().mockResolvedValue({ ok: true }),
    naviCtxUnselect: vi.fn().mockResolvedValue({ ok: true }),
    naviCtxInvertSel: vi.fn().mockResolvedValue({ ok: true }),
    naviCtxToggleSidechain: vi.fn().mockResolvedValue({ ok: true }),
    naviCtxAround: vi.fn().mockResolvedValue({ ok: true }),
};

vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}));

const mockShowMenu = vi.fn();

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeRenderHook<T>(useHookFn: () => T) {
    let result!: T;
    let root!: Root;
    const container = document.createElement('div');
    document.body.appendChild(container);

    function TestComponent() {
        result = useHookFn();
        return null;
    }

    act(() => {
        root = createRoot(container);
        root.render(React.createElement(TestComponent));
    });

    return {
        get result() { return result; },
        unmount() {
            act(() => root.unmount());
            document.body.removeChild(container);
        },
    };
}

function makeHit(overrides: Record<string, any> = {}) {
    return {
        objtype: 'MolCoord',
        obj_id: 1, obj_name: 'mol1',
        rend_id: 10, rend_name: 'ribbon1', rendtype: '*ribbon',
        atom_id: 42, sel: 'aid 42', message: 'ALA 10 CA',
        x: 1.0, y: 2.0, z: 3.0,
        occ: 1.0, bfac: 25.5,
        ...overrides,
    };
}

let hookHandle: ReturnType<typeof makeRenderHook<ReturnType<typeof useNaviContextMenu>>>;

beforeEach(() => {
    vi.clearAllMocks();
    mockShowMenu.mockResolvedValue(null);
    // After B, electronAPI exposes a generic `invoke(channel, payload)`. Route
    // NAVI_CTX_SHOW through to mockShowMenu so existing assertions on the
    // payload object remain valid.
    (window as any).electronAPI = {
      invoke: vi.fn((channel: string, payload: unknown) =>
        channel === IPC.NAVI_CTX_SHOW ? mockShowMenu(payload) : Promise.resolve(),
      ),
    };
    hookHandle = makeRenderHook(() => useNaviContextMenu());
});

afterEach(() => {
    hookHandle.unmount();
});

describe('useNaviContextMenu', () => {
    it('calls showNaviContextMenu with correct payload for normal renderer', async () => {
        await act(async () => {
            await hookHandle.result.openContextMenu(makeHit(), 1, 100, 200);
        });
        expect(mockShowMenu).toHaveBeenCalledWith({
            x: 100, y: 200,
            isSymm: false,
            atomLabel: 'mol1: ALA 10 CA',
            rendLabel: 'ribbon1 (*ribbon)',
            symmLabel: undefined,
        });
    });

    it('calls showNaviContextMenu with isSymm=true for symm renderer', async () => {
        const hit = makeHit({ rendtype: '*symm', symm_id: 5, symm_name: '2_555' });
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockShowMenu).toHaveBeenCalledWith(expect.objectContaining({
            isSymm: true,
            symmLabel: '2_555',
        }));
    });

    it('does nothing when menu is dismissed (action=null)', async () => {
        await act(async () => {
            await hookHandle.result.openContextMenu(makeHit(), 1, 0, 0);
        });
        expect(mockCm.naviCenterAt).not.toHaveBeenCalled();
    });

    it('dispatches centerAt', async () => {
        mockShowMenu.mockResolvedValue('centerAt');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCenterAt).toHaveBeenCalledWith({ viewId: 1, x: hit.x, y: hit.y, z: hit.z });
    });

    it('dispatches centerAtSymm', async () => {
        mockShowMenu.mockResolvedValue('centerAtSymm');
        const hit = makeHit({ rendtype: '*symm', symm_id: 3, rend_id: 10 });
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCenterAtSymm).toHaveBeenCalledWith({
            viewId: 1, objId: hit.obj_id, rendId: hit.rend_id, atomId: hit.atom_id, symmId: 3,
        });
    });

    it('skips centerAtSymm when symm_id is missing', async () => {
        mockShowMenu.mockResolvedValue('centerAtSymm');
        await act(async () => {
            await hookHandle.result.openContextMenu(makeHit(), 1, 0, 0);
        });
        expect(mockCm.naviCenterAtSymm).not.toHaveBeenCalled();
    });

    it.each([
        ['selectAtom', 'atom'],
        ['selectResid', 'residue'],
        ['selectChain', 'chain'],
        ['selectMol', 'mol'],
    ] as const)('dispatches %s with mode=%s', async (action, mode) => {
        mockShowMenu.mockResolvedValue(action);
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCtxSelect).toHaveBeenCalledWith({ viewId: 1, objId: hit.obj_id, atomId: hit.atom_id, mode });
    });

    it.each([
        ['addSelectAtom', 'atom'],
        ['addSelectResid', 'residue'],
        ['addSelectChain', 'chain'],
    ] as const)('dispatches %s with mode=%s', async (action, mode) => {
        mockShowMenu.mockResolvedValue(action);
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCtxAddSelect).toHaveBeenCalledWith({ viewId: 1, objId: hit.obj_id, atomId: hit.atom_id, mode });
    });

    it('dispatches unselect', async () => {
        mockShowMenu.mockResolvedValue('unselect');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCtxUnselect).toHaveBeenCalledWith({ viewId: 1, objId: hit.obj_id });
    });

    it('dispatches invertSel', async () => {
        mockShowMenu.mockResolvedValue('invertSel');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCtxInvertSel).toHaveBeenCalledWith({ viewId: 1, objId: hit.obj_id });
    });

    it('dispatches toggleSidechain', async () => {
        mockShowMenu.mockResolvedValue('toggleSidechain');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCtxToggleSidechain).toHaveBeenCalledWith({ viewId: 1, objId: hit.obj_id });
    });

    it.each([
        ['arByres3', 3, true],
        ['arByres5', 5, true],
        ['arByres7', 7, true],
        ['arByres10', 10, true],
        ['around3', 3, false],
        ['around5', 5, false],
        ['around7', 7, false],
        ['around10', 10, false],
    ] as const)('dispatches %s with distance=%d byres=%s', async (action, distance, byres) => {
        mockShowMenu.mockResolvedValue(action);
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(mockCm.naviCtxAround).toHaveBeenCalledWith({ viewId: 1, objId: hit.obj_id, distance, byres });
    });
});
