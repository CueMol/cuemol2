import { useCallback } from 'react';
import { useCueMol } from './useCueMol';
import type { HitTestResult } from '../types';
import type { NaviCtxAction } from '../../shared/ipcTypes';
import { IPC } from '../../shared/ipcChannels';

export function useNaviContextMenu(): {
    openContextMenu: (hit: HitTestResult, viewId: number, x: number, y: number) => Promise<void>;
} {
    const { cm } = useCueMol();

    const openContextMenu = useCallback(async (
        hit: HitTestResult,
        viewId: number,
        x: number,
        y: number,
    ): Promise<void> => {
        const isSymm = hit.rendtype === '*symm';
        const atomLabel = hit.obj_name ? `${hit.obj_name}: ${hit.message}` : hit.message;
        const rendLabel = `${hit.rend_name} (${hit.rendtype})`;

        const action: NaviCtxAction | null = await window.electronAPI.invoke(IPC.NAVI_CTX_SHOW, {
            x,
            y,
            isSymm,
            atomLabel,
            rendLabel,
            symmLabel: hit.symm_name,
        });

        if (!action || !cm) return;

        const objId = hit.obj_id;
        const atomId = hit.atom_id;

        switch (action) {
            case 'centerAt':
                await cm.invokeService('naviCenterAt', { viewId, x: hit.x, y: hit.y, z: hit.z });
                break;
            case 'centerAtSymm':
                if (hit.symm_id != null) {
                    await cm.invokeService('naviCenterAtSymm', { viewId, objId, rendId: hit.rend_id, atomId, symmId: hit.symm_id });
                }
                break;
            case 'selectAtom':
                await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'atom' });
                break;
            case 'selectResid':
                await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'residue' });
                break;
            case 'selectChain':
                await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'chain' });
                break;
            case 'selectMol':
                await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'mol' });
                break;
            case 'addSelectAtom':
                await cm.invokeService('naviCtxAddSelect', { viewId, objId, atomId, mode: 'atom' });
                break;
            case 'addSelectResid':
                await cm.invokeService('naviCtxAddSelect', { viewId, objId, atomId, mode: 'residue' });
                break;
            case 'addSelectChain':
                await cm.invokeService('naviCtxAddSelect', { viewId, objId, atomId, mode: 'chain' });
                break;
            case 'unselect':
                await cm.invokeService('naviCtxUnselect', { viewId, objId });
                break;
            case 'invertSel':
                await cm.invokeService('naviCtxInvertSel', { viewId, objId });
                break;
            case 'toggleSidechain':
                await cm.invokeService('naviCtxToggleSidechain', { viewId, objId });
                break;
            case 'arByres3':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 3, byres: true });
                break;
            case 'arByres5':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 5, byres: true });
                break;
            case 'arByres7':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 7, byres: true });
                break;
            case 'arByres10':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 10, byres: true });
                break;
            case 'around3':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 3, byres: false });
                break;
            case 'around5':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 5, byres: false });
                break;
            case 'around7':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 7, byres: false });
                break;
            case 'around10':
                await cm.invokeService('naviCtxAround', { viewId, objId, distance: 10, byres: false });
                break;
        }
    }, [cm]);

    return { openContextMenu };
}
