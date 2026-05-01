import { useEffect, useState, useRef } from 'react';
import { useCueMol } from './useCueMol';

const RISING_EDGE_DELAY_MS = 150;

// Returns true while AsyncCueMol has pending invokeWorker requests.
// Rising-edge debounced by 150ms to avoid flicker for short-lived calls
// (e.g. ObjProxy.getProp/setProp). Falling edge is immediate.
export function useCueMolBusy(): boolean {
    const { cueMolReady, cm } = useCueMol();
    const [busy, setBusy] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!cueMolReady || !cm) return;

        const apply = (next: boolean) => {
            if (next) {
                if (timerRef.current !== null) return;
                timerRef.current = setTimeout(() => {
                    timerRef.current = null;
                    if (cm.isBusy()) setBusy(true);
                }, RISING_EDGE_DELAY_MS);
            } else {
                if (timerRef.current !== null) {
                    clearTimeout(timerRef.current);
                    timerRef.current = null;
                }
                setBusy(false);
            }
        };

        apply(cm.isBusy());
        const unsubscribe = cm.subscribeBusy(apply);
        return () => {
            unsubscribe();
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [cueMolReady, cm]);

    return busy;
}
