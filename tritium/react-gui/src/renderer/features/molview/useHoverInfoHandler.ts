/**
 * @file features/molview/useHoverInfoHandler.ts
 * @description Pointer hover over the 3D view -> `naviHover` worker service ->
 * status-bar hover line.
 *
 * Renderer thread only. C++ emits no hover event (it drops plain moves), so
 * this hook samples DOM mousemove itself: throttled to HOVER_INTERVAL_MS, one
 * request in flight at a time, the latest position wins while a request is
 * pending, and a stale reply (a newer request or a clear happened since)
 * is dropped. Listeners are delegated on the content pane rather than the
 * canvas because the rubber-band overlay covers the canvas while a select
 * tool is active; both the canvas and the overlay bubble to the pane.
 */

import { useEffect, useRef } from 'react';
import type React from 'react';
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import { useActiveScene } from '@renderer/state/workspace';
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard';
import { MOLVIEW_CANVAS_SELECTOR } from './molViewCanvas';

/** Minimum spacing between two hover hit tests (about 30 Hz). */
export const HOVER_INTERVAL_MS = 33;

export interface UseHoverInfoHandlerArgs {
    /** The `.content-pane` element: canvas AND select-overlay events bubble here. */
    containerRef: React.RefObject<HTMLElement | null>;
    /** Hover-line setter (`useSetHoverMessage()`); called only when the text changes. */
    setHoverMessage: (msg: string | null) => void;
}

interface Pos {
    x: number;
    y: number;
}

/**
 * Drive the status-bar hover line from pointer movement over the 3D view.
 * Active for every viewport tool; suppressed while any button is pressed.
 */
export function useHoverInfoHandler({ containerRef, setHoverMessage }: UseHoverInfoHandlerArgs): void {
    const { cueMolReady, cm } = useCueMol();
    const { activeMolViewId } = useActiveScene();
    const guard = useStaleGuard();
    const setterRef = useRef(setHoverMessage);
    setterRef.current = setHoverMessage;

    const enabled = cueMolReady && cm !== null && activeMolViewId != null;
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
        let lastText: string | null = null;
        let disposed = false;

        const apply = (text: string | null): void => {
            if (text === lastText) return;
            lastText = text;
            setterRef.current(text);
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
            cm.invokeService('naviHover', { viewId, x: p.x, y: p.y }, { quiet: true })
                .then((res) => {
                    if (disposed || !guard.isCurrent(token)) return;
                    apply(res.hit && res.message ? res.message : null);
                })
                .catch(() => {
                    // worker gone / crashed: nothing to show
                })
                .finally(() => {
                    inFlight = false;
                    if (!disposed && pending !== null) schedule();  // latest position wins
                });
        };

        const onMouseMove = (e: MouseEvent): void => {
            if (e.buttons !== 0) {
                clear();  // any button held: no hover during a drag
                return;
            }
            if (!overCanvas(e)) {
                clear();
                return;
            }
            const p = toLocal(e);
            if (p === null) {
                clear();
                return;
            }
            if (pending === null && lastSent !== null && p.x === lastSent.x && p.y === lastSent.y) return;
            pending = p;
            schedule();
        };
        const onMouseDown = (): void => clear();
        const onMouseLeave = (): void => clear();

        container.addEventListener('mousemove', onMouseMove);
        container.addEventListener('mousedown', onMouseDown);
        container.addEventListener('mouseleave', onMouseLeave);
        return () => {
            disposed = true;
            container.removeEventListener('mousemove', onMouseMove);
            container.removeEventListener('mousedown', onMouseDown);
            container.removeEventListener('mouseleave', onMouseLeave);
            clear();
        };
    }, [cm, enabled, viewId, containerRef, guard]);
}
