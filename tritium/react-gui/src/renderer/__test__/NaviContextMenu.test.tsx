import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useNaviContextMenu } from '@renderer/features/molview/useNaviContextMenu';
import { ContextMenuProvider } from '@renderer/shell/menu/ContextMenuProvider';
import { IPC } from '@shared/ipcChannels';
import { clearHistory, getHistory } from '@renderer/h3-kit/MolSelList';

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }));
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }));

// After the apis/* facade collapse the context-menu hook calls
// `cm.invokeService('naviCtxSelect', args)` etc. instead of per-method
// facade functions. The mock dispatches every navi service through a single
// `invokeService` spy; per-service payloads are asserted via `callsFor`.
const mockCm = {
    invokeService: vi.fn().mockResolvedValue({ ok: true }),
};

/** Recorded `invokeService` payloads for a given service name. */
function callsFor(name: string): unknown[] {
    return mockCm.invokeService.mock.calls
        .filter((c) => c[0] === name)
        .map((c) => c[1]);
}

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}));

// The hook pulls dialog hooks whose providers live in DialogContext; mock
// the provider modules so the hook can mount with ContextMenuProvider only.
const mockShowNewRenderer = vi.fn();
const mockShowErrorAlert = vi.fn();
vi.mock('@renderer/dialogs/NewRendererDialogProvider', () => ({
    useShowNewRendererDialog: () => mockShowNewRenderer,
}));
vi.mock('@renderer/dialogs/ErrorAlertDialogProvider', () => ({
    useShowErrorAlert: () => mockShowErrorAlert,
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
        root.render(
            React.createElement(ContextMenuProvider, null, React.createElement(TestComponent)),
        );
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
    mockShowNewRenderer.mockResolvedValue(null);
    mockShowErrorAlert.mockResolvedValue(undefined);
    // electronAPI exposes a generic `invoke(channel, payload)`. Route
    // NAVI_CTX_SHOW through to mockShowMenu so existing assertions on the
    // payload object remain valid. platform 'darwin' selects the native
    // popup path (this IPC); the Windows/Linux React MenuPanel path is
    // covered separately by contextMenuProvider.test.tsx.
    (window as any).electronAPI = {
      platform: 'darwin',
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
        expect(callsFor('naviCenterAt')).toHaveLength(0);
    });

    it('dispatches centerAt', async () => {
        mockShowMenu.mockResolvedValue('centerAt');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(callsFor('naviCenterAt')).toContainEqual({ viewId: 1, x: hit.x, y: hit.y, z: hit.z });
    });

    it('dispatches centerAtSymm', async () => {
        mockShowMenu.mockResolvedValue('centerAtSymm');
        const hit = makeHit({ rendtype: '*symm', symm_id: 3, rend_id: 10 });
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(callsFor('naviCenterAtSymm')).toContainEqual({
            viewId: 1, objId: hit.obj_id, rendId: hit.rend_id, atomId: hit.atom_id, symmId: 3,
        });
    });

    it('skips centerAtSymm when symm_id is missing', async () => {
        mockShowMenu.mockResolvedValue('centerAtSymm');
        await act(async () => {
            await hookHandle.result.openContextMenu(makeHit(), 1, 0, 0);
        });
        expect(callsFor('naviCenterAtSymm')).toHaveLength(0);
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
        expect(callsFor('naviCtxSelect')).toContainEqual({ viewId: 1, objId: hit.obj_id, atomId: hit.atom_id, mode });
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
        expect(callsFor('naviCtxAddSelect')).toContainEqual({ viewId: 1, objId: hit.obj_id, atomId: hit.atom_id, mode });
    });

    it('dispatches unselect', async () => {
        mockShowMenu.mockResolvedValue('unselect');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(callsFor('naviCtxUnselect')).toContainEqual({ viewId: 1, objId: hit.obj_id });
    });

    it('dispatches invertSel', async () => {
        mockShowMenu.mockResolvedValue('invertSel');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(callsFor('naviCtxInvertSel')).toContainEqual({ viewId: 1, objId: hit.obj_id });
    });

    it('dispatches toggleSidechain', async () => {
        mockShowMenu.mockResolvedValue('toggleSidechain');
        const hit = makeHit();
        await act(async () => {
            await hookHandle.result.openContextMenu(hit, 1, 0, 0);
        });
        expect(callsFor('naviCtxToggleSidechain')).toContainEqual({ viewId: 1, objId: hit.obj_id });
    });

    describe('createSymmMol', () => {
        const SYMM_OPTS = {
            ok: true,
            sceneId: 7,
            objName: 'mol1 2_555',
            objClassName: 'MolCoord',
            rendererTypes: ['simple', 'ribbon'],
            presetTypes: [],
            defaultRendName: 'simple1',
        };
        const REND_OPTS = {
            objectName: 'mol1 edited',
            rendererType: 'ribbon',
            rendererName: 'ribbon1',
            selectionEnabled: false,
            selection: '*',
            centerView: true,
        };

        function routeServices(createResult: unknown = { ok: true, newObjId: 99 }) {
            mockCm.invokeService.mockImplementation((name: string) => {
                if (name === 'getCreateSymmMolOptions') return Promise.resolve(SYMM_OPTS);
                if (name === 'createSymmMol') return Promise.resolve(createResult);
                return Promise.resolve({ ok: true });
            });
        }

        it('prefetches options, shows the dialog, and dispatches the create wire', async () => {
            mockShowMenu.mockResolvedValue('createSymmMol');
            routeServices();
            mockShowNewRenderer.mockResolvedValue({ rendOpts: REND_OPTS });
            const hit = makeHit({ rendtype: '*symm', symm_id: 5, symm_name: '2_555' });

            await act(async () => {
                await hookHandle.result.openContextMenu(hit, 1, 0, 0);
            });

            expect(callsFor('getCreateSymmMolOptions')).toContainEqual({
                viewId: 1, objId: hit.obj_id, symmName: '2_555',
            });
            expect(mockShowNewRenderer).toHaveBeenCalledWith({
                sceneId: 7,
                objName: 'mol1 2_555',
                objClassName: 'MolCoord',
                rendererTypes: ['simple', 'ribbon'],
                presetTypes: [],
                defaultName: 'simple1',
                isMol: true,
            });
            // The edited object name from the dialog wins over the suggestion.
            expect(callsFor('createSymmMol')).toContainEqual({
                viewId: 1, objId: hit.obj_id, rendId: hit.rend_id, symmId: 5,
                objName: 'mol1 edited', rendOpts: REND_OPTS,
            });
            expect(mockShowErrorAlert).not.toHaveBeenCalled();
        });

        it('does not create when the dialog is cancelled', async () => {
            mockShowMenu.mockResolvedValue('createSymmMol');
            routeServices();
            mockShowNewRenderer.mockResolvedValue(null);
            const hit = makeHit({ rendtype: '*symm', symm_id: 5, symm_name: '2_555' });

            await act(async () => {
                await hookHandle.result.openContextMenu(hit, 1, 0, 0);
            });

            expect(callsFor('createSymmMol')).toHaveLength(0);
        });

        it('is a no-op when symm_id is missing from the hit', async () => {
            mockShowMenu.mockResolvedValue('createSymmMol');
            await act(async () => {
                await hookHandle.result.openContextMenu(makeHit(), 1, 0, 0);
            });
            expect(callsFor('getCreateSymmMolOptions')).toHaveLength(0);
            expect(mockShowNewRenderer).not.toHaveBeenCalled();
        });

        it('shows an error alert when the service reports failure', async () => {
            mockShowMenu.mockResolvedValue('createSymmMol');
            routeServices({ ok: false, error: 'copyAtoms failed' });
            mockShowNewRenderer.mockResolvedValue({ rendOpts: REND_OPTS });
            const hit = makeHit({ rendtype: '*symm', symm_id: 5, symm_name: '2_555' });

            await act(async () => {
                await hookHandle.result.openContextMenu(hit, 1, 0, 0);
            });

            expect(mockShowErrorAlert).toHaveBeenCalledWith({
                title: 'Create SYMM mol',
                message: 'Create symm mol failed: copyAtoms failed',
            });
        });
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
        expect(callsFor('naviCtxAround')).toContainEqual({ viewId: 1, objId: hit.obj_id, distance, byres });
    });
});

describe('useNaviContextMenu -- selection history', () => {
    it('records the expression a selection service reports as applied', async () => {
        clearHistory();
        mockShowMenu.mockResolvedValue('selectResid');
        mockCm.invokeService.mockImplementation((name: string) =>
            Promise.resolve(name === 'naviCtxSelect' ? { ok: true, selStr: "'A'.10.*" } : { ok: true }),
        );
        await act(async () => {
            await hookHandle.result.openContextMenu(makeHit(), 1, 0, 0);
        });
        expect(getHistory()).toEqual(["'A'.10.*"]);
        mockCm.invokeService.mockResolvedValue({ ok: true });
    });
});
