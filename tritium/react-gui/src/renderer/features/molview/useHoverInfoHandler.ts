/**
 * @file features/molview/useHoverInfoHandler.ts
 * @description Pointer hover over the 3D view -> `naviHover` worker service ->
 * the hover label overlay (MolViewHoverLabel).
 *
 * Renderer thread only. C++ emits no hover event (it drops plain moves), so
 * this hook samples DOM mousemove itself: throttled to HOVER_INTERVAL_MS, one
 * request in flight at a time, the latest position wins while a request is
 * pending, and a stale reply (a newer request or a clear happened since)
 * is dropped. Listeners are delegated on the content pane rather than the
 * canvas because the rubber-band overlay covers the canvas while a select
 * tool is active; both the canvas and the overlay bubble to the pane.
 *
 * The hover ends on a left / middle press (a navigation drag follows), but not
 * on a right press: that opens the navi context menu, which holds the hover
 * (see hoverHold.ts) so the hit the menu is about stays visible and
 * highlighted until the menu resolves.
 */

import { useEffect, useRef } from 'react';
import type React from 'react';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useActiveScene } from '@renderer/state/workspace';
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard';
import { usePickingPrefs } from '@renderer/contexts/PickingPrefsContext';
import type { HoverLabel } from '@renderer/worker/server/services/navi/naviTool';
import { MOLVIEW_CANVAS_SELECTOR } from './molViewCanvas';
import { isHoverHeld, onHoverHoldRelease } from './hoverHold';

export type { HoverLabel };

/** Identity of a label: two labels with the same key describe the same hit. */
export function hoverLabelKey(l: HoverLabel): string {
    return [l.objName, l.rendName, l.chain, l.resIndex, l.resName, l.atomName, l.symop, l.text]
        .map((v) => v ?? '')
        .join('\u0001');
}

/** Minimum spacing between two hover hit tests (about 30 Hz). */
export const HOVER_INTERVAL_MS = 33;

export interface UseHoverInfoHandlerArgs {
    /** The `.content-pane` element: canvas AND select-overlay events bubble here. */
    containerRef: React.RefObject<HTMLElement | null>;
    /** Label setter; called only when the hit (hoverLabelKey) changes. */
    setHoverLabel: (label: HoverLabel | null) => void;
}

interface Pos {
    x: number;
    y: number;
}

/**
 * Drive the hover label from pointer movement over the 3D view.
 * Active for every viewport tool; suppressed while any button is pressed.
 */
export function useHoverInfoHandler({ containerRef, setHoverLabel }: UseHoverInfoHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeMolViewId } = useActiveScene();
    // Settings > Mouse & Navigation > "Hover info": off stops the sampling
    // (no hit test requests at all), not just the label. "Hover highlight"
    // rides on the same request: the worker updates the view's highlight from
    // the hit result, and a clear is sent when the hover ends.
    const { hoverInfo, hoverHighlight } = usePickingPrefs();
    const guard = useStaleGuard();
    const setterRef = useRef(setHoverLabel);
    setterRef.current = setHoverLabel;

    const enabled = cueMolReady && cm !== null && activeMolViewId != null && hoverInfo;
    const viewId = activeMolViewId ?? -1;

    useEffect(() => {
        const container = containerRef.current;
        if (!enabled || !cm || !container) return;

        let canvas: Element | null = null;
        let pending: Pos | null = null;
        let inFlight = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let lastSent: Pos | null = null;
        let lastIssuedAt = -Infinity;
        let lastKey: string | null = null;
        // Where the pointer last was, hoverable or not (null off the canvas /
        // during a drag). Tracked even while held, so the resync on release
        // knows where to resample.
        let lastPos: Pos | null = null;
        // The view currently shows a highlight set by our last reply.
        let highlighted = false;
        let disposed = false;

        const apply = (label: HoverLabel | null): void => {
            const key = label ? hoverLabelKey(label) : null;
            if (key === lastKey) return;
            lastKey = key;
            setterRef.current(label);
        };

        const clear = (): void => {
            guard.invalidate();
            pending = null;
            lastSent = null;
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            apply(null);
            // The worker handles messages in order, so this lands after any
            // hover request still in flight (whose reply is now stale).
            if (highlighted) {
                highlighted = false;
                cm.invokeService('naviHoverClear', { viewId }, { quiet: true }).catch(() => {
                    // worker gone: nothing to clear
                });
            }
        };

        const findCanvas = (): Element | null => {
            if (canvas === null) canvas = container.querySelector(MOLVIEW_CANVAS_SELECTOR);
            return canvas;
        };

        // The palette / popovers over the pane are "not over the view".
        const overCanvas = (e: MouseEvent): boolean => {
            const target = e.target as Element | null;
            const c = findCanvas();
            if (!target || !c) return false;
            return target === c || target.closest('.rectsel-overlay') !== null;
        };

        const toLocal = (e: MouseEvent): Pos | null => {
            const c = findCanvas();
            if (!c) return null;
            const r = c.getBoundingClientRect();
            const x = Math.round(e.clientX - r.left);
            const y = Math.round(e.clientY - r.top);
            if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
            return { x, y };
        };

        const schedule = (): void => {
            if (inFlight || timer !== null) return;
            const wait = Math.max(0, HOVER_INTERVAL_MS - (Date.now() - lastIssuedAt));
            if (wait === 0) issue();
            else timer = setTimeout(issue, wait);
        };

        const issue = (): void => {
            timer = null;
            if (disposed || pending === null || inFlight) return;
            const p = pending;
            pending = null;
            lastSent = p;
            lastIssuedAt = Date.now();
            inFlight = true;
            const token = guard.next();
            cm.invokeService('naviHover', { viewId, x: p.x, y: p.y, highlight: hoverHighlight }, { quiet: true })
                .then((res) => {
                    if (disposed || !guard.isCurrent(token)) return;
                    if (hoverHighlight) highlighted = res.hit;
                    apply(res.hit && res.label ? res.label : null);
                })
                .catch(() => {
                    // worker gone / crashed: nothing to show
                })
                .finally(() => {
                    inFlight = false;
                    if (!disposed && pending !== null) schedule();  // latest position wins
                });
        };

        /** The hoverable position of an event: null while dragging / off the view. */
        const readPos = (e: MouseEvent): Pos | null => {
            if (e.buttons !== 0) return null;  // any button held: no hover during a drag
            if (!overCanvas(e)) return null;
            return toLocal(e);
        };

        const onMouseMove = (e: MouseEvent): void => {
            lastPos = readPos(e);
            // A context menu owns the pointer: keep the frozen hit and send
            // nothing, but the position above is still recorded.
            if (isHoverHeld()) return;
            const p = lastPos;
            if (p === null) {
                clear();
                return;
            }
            if (pending === null && lastSent !== null && p.x === lastSent.x && p.y === lastSent.y) return;
            pending = p;
            schedule();
        };
        // Right press: the navi context menu it opens is about the element
        // under the pointer, so the hit survives until the menu resolves.
        const onMouseDown = (e: MouseEvent): void => {
            if (e.button === 2) return;
            clear();
        };
        const onMouseLeave = (): void => {
            lastPos = null;
            if (isHoverHeld()) return;
            clear();
        };
        // Menu resolved: pick up where the pointer actually is. Resampling
        // rather than keeping the frozen hit is what makes the highlight right
        // after an action that moved the view (e.g. Center at).
        const onHoldRelease = (): void => {
            if (disposed) return;
            if (lastPos === null) {
                clear();
                return;
            }
            pending = lastPos;
            schedule();
        };

        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mouseleave', onMouseLeave);
        const unsubscribeHold = onHoverHoldRelease(onHoldRelease);
        return () => {
            disposed = true;
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mouseleave', onMouseLeave);
            unsubscribeHold();
            clear();
        };
    }, [cm, enabled, viewId, containerRef, guard, hoverHighlight]);
}
