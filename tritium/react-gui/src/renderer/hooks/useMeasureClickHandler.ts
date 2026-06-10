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
import { useEffect } from 'react';
import { useCueMol } from './useCueMol';
import { useMolTabState } from './useMolTab';
import { useActiveToolContext } from '../contexts/ActiveToolContext';
import { useCueMolEventListener } from './useCueMolEventListener';
import * as event from '../event';
import type { ToolId } from '../data/viewportTools';
import type { MeasureMode } from '../worker/server/services/measure.service';

export interface UseMeasureClickHandlerArgs {
    setStatusMessage: (msg: string | null) => void;
    /** Current target label-set name ('' = Auto). Passed to each measurePick. */
    target: string;
}

const LBTN = 1 << 3; // left button modifier bit (same as UXP)

/** Tools handled by the measure pick sequence. */
const MEASURE_TOOLS = new Set<ToolId>(['distance', 'angle', 'torsion']);

function isMeasureTool(tool: ToolId): tool is MeasureMode {
    return MEASURE_TOOLS.has(tool);
}

export function useMeasureClickHandler({ setStatusMessage, target }: UseMeasureClickHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeViewID } = useMolTabState();
    const activeTool = useActiveToolContext();

    const enabled = cueMolReady && activeViewID != null && isMeasureTool(activeTool);
    const viewId = activeViewID ?? -1;

    useCueMolEventListener({
        cm,
        enabled,
        category: 'mouseClicked',
        srcMask: event.SEM_INDEV,
        evtMask: event.SEM_ANY,
        scopeId: viewId,
        handler: async (args) => {
            if (!cm || !isMeasureTool(activeTool)) return;
            const { x, y, mod } = (args as { obj?: { x?: number; y?: number; mod?: number } } | null)?.obj ?? {};
            if (x == null || y == null || mod == null) return;
            if (!(mod & LBTN)) return;
            const result = await cm.invokeService('measurePick', { viewId, x, y, mode: activeTool, target });
            if (result?.handled && result.statusMessage) {
                setStatusMessage(result.statusMessage);
            }
        },
    });

    // Cancel any in-progress pick sequence when leaving a measure tool or
    // switching the active view: the cleanup runs when `enabled`/`viewId`
    // change, so a stale first pick can never combine with a later one (and the
    // crosshairs are cleared). Worker is the source of truth for the buffer.
    useEffect(() => {
        if (!cm || !enabled) return;
        return () => {
            void cm.invokeService('measureReset', { viewId });
        };
    }, [cm, enabled, viewId]);

    // Escape cancels the current pick sequence while a measure tool is active.
    useEffect(() => {
        if (!cm || !enabled) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            void cm.invokeService('measureReset', { viewId }).then((r) => {
                if (r?.cleared) setStatusMessage('Measure: pick canceled');
            });
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [cm, enabled, viewId, setStatusMessage]);
}
