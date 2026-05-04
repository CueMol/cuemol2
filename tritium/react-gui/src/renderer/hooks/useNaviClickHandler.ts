import { useEffect, useRef } from 'react';
import * as event from '../event';
import { useCueMol } from './useCueMol';
import { useMolTabState } from './useMolTab';
import { useActiveToolContext } from '../contexts/ActiveToolContext';
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

    useEffect(() => {
        if (!cueMolReady || !cm || activeViewID == null || activeTool !== 'navigate') {
            return () => { };
        }

        const viewId = activeViewID;
        let clickCbId: number | undefined;
        let dblClickCbId: number | undefined;

        (async () => {
            const handleClick = async (args: any): Promise<void> => {
                const { x, y, mod } = args.obj ?? {};
                if (x == null || y == null || mod == null) return;

                if (mod & MBTN) {
                    // Right click — run hittest and open context menu
                    const result = await cm.naviHitTest({ viewId, x, y });
                    if (result?.hit && result.raw && result.raw.objtype === 'MolCoord') {
                        openContextMenu(result.raw as HitTestResult, viewId);
                    }
                } else if (mod & LBTN) {
                    // Left click — hittest + log + atom label toggle
                    const result = await cm.naviClickAtom({ viewId, x, y });
                    if (result?.handled && result.statusMessage) {
                        setStatusMessage(result.statusMessage);
                    }
                }
            };

            const handleDblClick = async (args: any): Promise<void> => {
                const { x, y, mod } = args.obj ?? {};
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

                if (result?.handled) {
                    if (mode === 'toggle') {
                        prevObjIdRef.current = result.objId;
                        prevAtomIdRef.current = result.atomId;
                    }
                }
            };

            clickCbId = await cm.addEventListener(
                'mouseClicked',
                event.SEM_INDEV,
                event.SEM_ANY,
                viewId,
                handleClick,
            );

            dblClickCbId = await cm.addEventListener(
                'mouseDoubleClicked',
                event.SEM_INDEV,
                event.SEM_ANY,
                viewId,
                handleDblClick,
            );
        })();

        return () => {
            if (clickCbId !== undefined) cm.removeEventListener(clickCbId);
            if (dblClickCbId !== undefined) cm.removeEventListener(dblClickCbId);
        };
    }, [cueMolReady, activeViewID, activeTool]); // eslint-disable-line react-hooks/exhaustive-deps
}
