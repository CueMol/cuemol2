/**
 * @file hooks/useBondEditClickHandler.ts
 * @description Click handler for the bond-editor (Add Bond) tool. Subscribes to
 * the C++ `mouseClicked` event while the tool is active and forwards each
 * left-click to the `bondEditPick` worker service, which resolves the click to
 * an atom and -- on the second atom in the same molecule -- creates a bond.
 *
 * Mirrors `useMeasureClickHandler`: the bond tool deliberately leaves
 * `RectSelectOverlay` click-through, so camera drags (rotate / translate) reach
 * the C++ view natively between the two picks; only discrete clicks (which the
 * view reports as `mouseClicked`) become picks. `useNaviClickHandler` is gated
 * to navigate / rectSelect only, so the two handlers never both fire here.
 */
import { useEffect } from 'react';
import { useCueMol } from './useCueMol';
import { useMolTabState } from './useMolTab';
import { useActiveToolContext } from '../contexts/ActiveToolContext';
import { useCueMolEventListener } from './useCueMolEventListener';
import * as event from '../event';

export interface UseBondEditClickHandlerArgs {
    setStatusMessage: (msg: string | null) => void;
}

const LBTN = 1 << 3; // left button modifier bit (same as UXP)

export function useBondEditClickHandler({ setStatusMessage }: UseBondEditClickHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeViewID } = useMolTabState();
    const activeTool = useActiveToolContext();

    const enabled = cueMolReady && activeViewID != null && activeTool === 'bondEdit';
    const viewId = activeViewID ?? -1;

    useCueMolEventListener({
        cm,
        enabled,
        category: 'mouseClicked',
        srcMask: event.SEM_INDEV,
        evtMask: event.SEM_ANY,
        scopeId: viewId,
        handler: async (args) => {
            if (!cm || activeTool !== 'bondEdit') return;
            const { x, y, mod } = (args as { obj?: { x?: number; y?: number; mod?: number } } | null)?.obj ?? {};
            if (x == null || y == null || mod == null) return;
            if (!(mod & LBTN)) return;
            const result = await cm.invokeService('bondEditPick', { viewId, x, y });
            if (result?.statusMessage) {
                setStatusMessage(result.statusMessage);
            }
        },
    });

    // Cancel any in-progress pick when leaving the bond tool or switching the
    // active view: the cleanup runs when `enabled`/`viewId` change, so a stale
    // first pick can never combine with a later one (and the crosshair is
    // cleared). Worker is the source of truth for the buffer.
    useEffect(() => {
        if (!cm || !enabled) return;
        return () => {
            void cm.invokeService('bondEditReset', { viewId });
        };
    }, [cm, enabled, viewId]);

    // Escape cancels the current pick while the bond tool is active.
    useEffect(() => {
        if (!cm || !enabled) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            void cm.invokeService('bondEditReset', { viewId }).then((r) => {
                if (r?.cleared) setStatusMessage('Bond edit: pick canceled');
            });
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [cm, enabled, viewId, setStatusMessage]);
}
