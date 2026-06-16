import { useRef } from 'react';
import * as event from '../event';
import { useCueMol } from './useCueMol';
import { useMolTabState } from './useMolTab';
import { useActiveToolContext } from '../contexts/ActiveToolContext';
import { useCueMolEventListener } from './useCueMolEventListener';
import { decodeClick, INDEV_LBTN, INDEV_RBTN, INDEV_SHIFT } from '../worker/shared/inDevModif';
import type { HitTestResult } from '../types';

export interface UseNaviClickHandlerArgs {
    setStatusMessage: (msg: string | null) => void;
    openContextMenu: (hit: HitTestResult, viewId: number) => void;
}

export function useNaviClickHandler({ setStatusMessage, openContextMenu }: UseNaviClickHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeViewID } = useMolTabState();
    const activeTool = useActiveToolContext();

    // Track previous hit for shift+double-click extend selection
    const prevObjIdRef = useRef<number | undefined>(undefined);
    const prevAtomIdRef = useRef<number | undefined>(undefined);

    // Active for the navigate tool, and also while rectSelect is active: the
    // rubber-band overlay forwards every non-(left-drag) interaction to the C++
    // view, so clicks / double-clicks / right-click context menu fall back to
    // the navigate-tool behaviour (UXP navi-toolribbon parity).
    const enabled =
        cueMolReady &&
        activeViewID != null &&
        (activeTool === 'navigate' || activeTool === 'rectSelect');
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
            const click = decodeClick(args);
            if (!click) return;
            const { x, y, mod } = click;
            if (mod & INDEV_RBTN) {
                const result = await cm.naviHitTest({ viewId, x, y });
                if (result?.hit && result.raw && result.raw.objtype === 'MolCoord') {
                    openContextMenu(result.raw as HitTestResult, viewId);
                }
            } else if (mod & INDEV_LBTN) {
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
            const click = decodeClick(args);
            if (!click) return;
            const { x, y, mod } = click;
            if (!(mod & INDEV_LBTN)) return;
            const mode = (mod & INDEV_SHIFT) ? 'extend' : 'toggle';
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
