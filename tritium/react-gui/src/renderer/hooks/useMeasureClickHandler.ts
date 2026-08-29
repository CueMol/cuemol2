/**
 * @file hooks/useMeasureClickHandler.ts
 * @description Click handler for the measure (distance / angle / torsion)
 * tool. Subscribes to the C++ `mouseClicked` event while a measure tool is
 * active and forwards each left-click to the `measurePick` worker service,
 * which resolves the click to an atom and accumulates the pick sequence.
 *
 * The measure tool deliberately leaves `RectSelectOverlay` click-through, so
 * camera drags (rotate / translate) reach the C++ view natively between picks
 * -- only discrete clicks (which the view reports as `mouseClicked`) become
 * picks. This mirrors the navigate tool, which also picks on click while drag
 * drives the camera; `useNaviClickHandler` is gated off for measure tools so
 * the two handlers never both fire.
 */
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useActiveScene } from '@renderer/state/workspace';
import { useActiveToolContext } from '../contexts/ActiveToolContext';
import { usePickClickHandler } from './usePickClickHandler';
import type { ToolId } from '../data/viewportTools';
import type { MeasureMode } from '../worker/server/services/measure.service';

export interface UseMeasureClickHandlerArgs {
    setStatusMessage: (msg: string | null) => void;
    /** Current target label-set name ('' = Auto). Passed to each measurePick. */
    target: string;
}

/** Tools handled by the measure pick sequence. */
const MEASURE_TOOLS = new Set<ToolId>(['distance', 'angle', 'torsion']);

function isMeasureTool(tool: ToolId): tool is MeasureMode {
    return MEASURE_TOOLS.has(tool);
}

export function useMeasureClickHandler({ setStatusMessage, target }: UseMeasureClickHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeMolViewId: activeViewID } = useActiveScene();
    const activeTool = useActiveToolContext();

    const enabled = cueMolReady && activeViewID != null && isMeasureTool(activeTool);
    const viewId = activeViewID ?? -1;

    usePickClickHandler({
        cm,
        enabled,
        viewId,
        setStatusMessage,
        pick: async (x, y) => {
            // Re-validate the active tool: the closure may outlive a tool
            // switch by one event before the subscription is torn down.
            if (!isMeasureTool(activeTool)) return null;
            const result = await cm!.invokeService('measurePick', { viewId, x, y, mode: activeTool, target });
            return result?.handled ? result : null;
        },
        reset: () => cm!.invokeService('measureReset', { viewId }),
        escapeMessage: 'Measure: pick canceled',
    });
}
