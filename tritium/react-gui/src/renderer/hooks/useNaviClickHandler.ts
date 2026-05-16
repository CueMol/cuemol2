import { useRef } from 'react';
import * as event from '../event';
import { useCueMol } from './useCueMol';
import { useMolTabState } from './useMolTab';
import { useActiveToolContext } from '../contexts/ActiveToolContext';
import { useCueMolEventListener } from './useCueMolEventListener';
import type { HitTestResult } from '../types';

export interface UseNaviClickHandlerArgs {
    setStatusMessage: (msg: string | null) => void;
    openContextMenu: (hit: HitTestResult, viewId: number) => void;
}

const LBTN = 1 << 3;  // left button modifier bit (same as UXP)
const MBTN = 1 << 4;  // middle button modifier bit
const SHIFT = 1 << 0; // shift modifier bit

export function useNaviClickHandler({ setStatusMessage, openContextMenu }: UseNaviClickHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeViewID } = useMolTabState();
    const activeTool = useActiveToolContext();

    // Track previous hit for shift+double-click extend selection
    const prevObjIdRef = useRef<number | undefined>(undefined);
    const prevAtomIdRef = useRef<number | undefined>(undefined);

    const enabled = cueMolReady && activeViewID != null && activeTool === 'navigate';
    const viewId = activeViewID ?? -1;

    useCueMolEventListener({
        cm,
        enabled,
        category: 'mouseClicked',
        srcMask: event.SEM_INDEV,
        evtMask: event.SEM_ANY,
        scopeId: viewId,
        handler: async (args) => {
            if (!cm) return;
            const { x, y, mod } = (args as { obj?: { x?: number; y?: number; mod?: number } } | null)?.obj ?? {};
            if (x == null || y == null || mod == null) return;
            if (mod & MBTN) {
                const result = await cm.naviHitTest({ viewId, x, y });
                if (result?.hit && result.raw && result.raw.objtype === 'MolCoord') {
                    openContextMenu(result.raw as HitTestResult, viewId);
                }
            } else if (mod & LBTN) {
                const result = await cm.naviClickAtom({ viewId, x, y });
                if (result?.handled && result.statusMessage) {
                    setStatusMessage(result.statusMessage);
                }
            }
        },
    });

    useCueMolEventListener({
        cm,
        enabled,
        category: 'mouseDoubleClicked',
        srcMask: event.SEM_INDEV,
        evtMask: event.SEM_ANY,
        scopeId: viewId,
        handler: async (args) => {
            if (!cm) return;
            const { x, y, mod } = (args as { obj?: { x?: number; y?: number; mod?: number } } | null)?.obj ?? {};
            if (x == null || y == null || mod == null) return;
            if (!(mod & LBTN)) return;
            const mode = (mod & SHIFT) ? 'extend' : 'toggle';
            const result = await cm.naviResidSel({
                viewId,
                x,
                y,
                mode,
                prevObjId: prevObjIdRef.current,
                prevAtomId: prevAtomIdRef.current,
            });
            if (result?.handled && mode === 'toggle') {
                prevObjIdRef.current = result.objId;
                prevAtomIdRef.current = result.atomId;
            }
        },
    });
}
