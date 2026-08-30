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
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useActiveScene } from '@renderer/state/workspace';
import { useActiveToolContext } from '@renderer/contexts/ActiveToolContext';
import { usePickClickHandler } from './usePickClickHandler';

export interface UseBondEditClickHandlerArgs {
    setStatusMessage: (msg: string | null) => void;
}

export function useBondEditClickHandler({ setStatusMessage }: UseBondEditClickHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeMolViewId: activeViewID } = useActiveScene();
    const activeTool = useActiveToolContext();

    const enabled = cueMolReady && activeViewID != null && activeTool === 'bondEdit';
    const viewId = activeViewID ?? -1;

    usePickClickHandler({
        cm,
        enabled,
        viewId,
        setStatusMessage,
        pick: async (x, y) => {
            // Re-validate the tool: the closure may outlive a tool switch by
            // one event before the subscription is torn down.
            if (activeTool !== 'bondEdit') return null;
            return cm!.invokeService('bondEditPick', { viewId, x, y });
        },
        reset: () => cm!.invokeService('bondEditReset', { viewId }),
        escapeMessage: 'Bond edit: pick canceled',
    });
}
