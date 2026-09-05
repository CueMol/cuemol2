import { useCallback } from 'react';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import type { HitTestResult } from '@renderer/types';
import type { NaviCtxAction } from '@shared/types/naviCtxMenu';
import { IPC } from '@shared/ipcChannels';
import { buildNaviCtxMenuNodes } from '@shared/naviCtxMenu';
import { useShowContextMenu } from '@renderer/shell/menu/ContextMenuProvider';
import { useShowNewRendererDialog } from '@renderer/dialogs/NewRendererDialogProvider';
import { useShowErrorAlert } from '@renderer/dialogs/ErrorAlertDialogProvider';
import { recordAppliedSel, type AppliedSelResult } from '@renderer/h3-kit/MolSelList';

export function useNaviContextMenu(): {
    openContextMenu: (hit: HitTestResult, viewId: number, x: number, y: number) => Promise<void>;
} {
    const { cm } = useCueMol();
    const showContextMenu = useShowContextMenu();
    const showNewRenderer = useShowNewRendererDialog();
    const showErrorAlert = useShowErrorAlert();

    const openContextMenu = useCallback(async (
        hit: HitTestResult,
        viewId: number,
        x: number,
        y: number,
    ): Promise<void> => {
        const isSymm = hit.rendtype === '*symm';
        const atomLabel = hit.obj_name ? `${hit.obj_name}: ${hit.message}` : hit.message;
        const rendLabel = `${hit.rend_name} (${hit.rendtype})`;
        const payload = { isSymm, atomLabel, rendLabel, symmLabel: hit.symm_name };

        // macOS shows the native menu (main process); Windows / Linux render
        // the same shared template with the React MenuPanel for a look that
        // matches the menu bar dropdowns.
        const api = window.electronAPI;
        const action: NaviCtxAction | null =
            api?.platform === 'darwin'
                ? await api.invoke(IPC.NAVI_CTX_SHOW, { x, y, ...payload })
                : await showContextMenu(buildNaviCtxMenuNodes(payload), { x, y });

        if (!action || !cm) return;

        const objId = hit.obj_id;
        const atomId = hit.atom_id;

        // The selection services return the expression they applied; it is
        // recorded once after the dispatch (nothing for the other actions).
        let applied: AppliedSelResult | undefined;
        switch (action) {
            case 'centerAt':
                await cm.invokeService('naviCenterAt', { viewId, x: hit.x, y: hit.y, z: hit.z });
                break;
            case 'centerAtSymm':
                if (hit.symm_id != null) {
                    await cm.invokeService('naviCenterAtSymm', { viewId, objId, rendId: hit.rend_id, atomId, symmId: hit.symm_id });
                }
                break;
            case 'createSymmMol': {
                // UXP navi-toolribbon `createSymmObj`: materialize the hit
                // symmetry image as a new MolCoord via the shared
                // NewRendererDialog (its object-name field edits the new name).
                if (hit.symm_id == null) break;
                const opts = await cm.invokeService('getCreateSymmMolOptions', {
                    viewId, objId, symmName: hit.symm_name ?? '',
                });
                if (!opts.ok) break;
                if (opts.rendererTypes.length === 0 && opts.presetTypes.length === 0) break;
                const dlg = await showNewRenderer({
                    sceneId: opts.sceneId,
                    objName: opts.objName,
                    objClassName: opts.objClassName,
                    rendererTypes: opts.rendererTypes,
                    presetTypes: opts.presetTypes,
                    defaultName: opts.defaultRendName,
                    isMol: true,
                });
                if (!dlg) break;
                const objName = dlg.rendOpts.objectName.trim() || opts.objName;
                const res = await cm.invokeService('createSymmMol', {
                    viewId, objId, rendId: hit.rend_id, symmId: hit.symm_id,
                    objName, rendOpts: dlg.rendOpts,
                });
                if (!res.ok) {
                    await showErrorAlert({
                        title: 'Create SYMM mol',
                        message: `Create symm mol failed: ${res.error ?? 'unknown error'}`,
                    });
                }
                break;
            }
            case 'selectAtom':
                applied = await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'atom' });
                break;
            case 'selectResid':
                applied = await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'residue' });
                break;
            case 'selectChain':
                applied = await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'chain' });
                break;
            case 'selectMol':
                applied = await cm.invokeService('naviCtxSelect', { viewId, objId, atomId, mode: 'mol' });
                break;
            case 'addSelectAtom':
                applied = await cm.invokeService('naviCtxAddSelect', { viewId, objId, atomId, mode: 'atom' });
                break;
            case 'addSelectResid':
                applied = await cm.invokeService('naviCtxAddSelect', { viewId, objId, atomId, mode: 'residue' });
                break;
            case 'addSelectChain':
                applied = await cm.invokeService('naviCtxAddSelect', { viewId, objId, atomId, mode: 'chain' });
                break;
            case 'unselect':
                await cm.invokeService('naviCtxUnselect', { viewId, objId });
                break;
            case 'invertSel':
                applied = await cm.invokeService('naviCtxInvertSel', { viewId, objId });
                break;
            case 'toggleSidechain':
                applied = await cm.invokeService('naviCtxToggleSidechain', { viewId, objId });
                break;
            case 'arByres3':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 3, byres: true });
                break;
            case 'arByres5':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 5, byres: true });
                break;
            case 'arByres7':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 7, byres: true });
                break;
            case 'arByres10':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 10, byres: true });
                break;
            case 'around3':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 3, byres: false });
                break;
            case 'around5':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 5, byres: false });
                break;
            case 'around7':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 7, byres: false });
                break;
            case 'around10':
                applied = await cm.invokeService('naviCtxAround', { viewId, objId, distance: 10, byres: false });
                break;
        }
        recordAppliedSel(applied);
    }, [cm, showContextMenu, showNewRenderer, showErrorAlert]);

    return { openContextMenu };
}
