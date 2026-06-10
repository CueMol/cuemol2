/**
 * @file components/RectSelectOverlay.tsx
 * @description Transparent overlay layered over the 3D viewport that handles
 * rubber-band (rectangle) atom selection for the `rectSelect` tool.
 *
 * Design: the overlay captures pointer events only while the `rectSelect`
 * tool is active (`pointer-events: auto`); otherwise it is click-through
 * (`pointer-events: none`) so the canvas keeps receiving camera-drag events.
 *
 * While `rectSelect` is active the overlay sits on top of the canvas, so the
 * canvas no longer sees raw mouse events. To keep the navigate-tool
 * interactions usable (atom pick, double-click residue select, right-click
 * context menu, camera pan/rotate via other buttons), the overlay acts as a
 * router that mirrors UXP `navi-toolribbon.js`: it consumes only the
 * left-button *drag* (rubber-band select, which would otherwise rotate the
 * camera) and forwards every other interaction to the worker via
 * `cm.onMouseEvent`, exactly as `MolViewPane` does in navigate mode. A
 * left-button *click* (press without drag) is also forwarded so the C++ view
 * emits the usual click event and `useNaviClickHandler` (enabled while
 * rectSelect is active) handles it.
 *
 * The rubber-band rectangle is drawn here in the renderer (HTML backend).
 * The drag-capture skeleton is independent of how the rectangle is rendered,
 * so a C++ `RectSelDrawObj` backend can replace `useHtmlRubberBand` later
 * without touching the drag/selection logic.
 */

import React, { useMemo, useRef, useState } from 'react'
import { useActiveToolContext } from '../contexts/ActiveToolContext'
import { useMolTabState } from '../hooks/useMolTab'
import { useCueMol } from '../hooks/useCueMol'

/** Drag distance (px) below which a left press is treated as a click, not a drag. */
const DRAG_THRESHOLD = 3

/** Rectangle in canvas-local logical pixels. */
interface Rect {
    left: number
    top: number
    width: number
    height: number
}

/**
 * Render backend for the rubber-band rectangle. The overlay's drag handlers
 * call these regardless of how the rectangle is drawn, so the backend can be
 * swapped (HTML div now, C++ RectSelDrawObj later) without changing the
 * drag/selection code.
 */
export interface RubberBandBackend {
    /** Drag started at the given canvas-local point. */
    begin(x0: number, y0: number): void
    /** Drag updated -- draw the current rectangle. */
    update(rect: Rect): void
    /** Drag finished -- clear the rectangle. */
    end(): void
}

/** Pending left-button interaction: a click until it crosses DRAG_THRESHOLD. */
interface LeftDrag {
    x0: number
    y0: number
    /** The original mousedown DOM event, replayed on a click (no-drag) release. */
    downEvent: MouseEvent
    dragging: boolean
}

/** Normalize two drag points into a top-left-anchored rectangle. */
function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
    return {
        left: Math.min(x0, x1),
        top: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
    }
}

/**
 * HTML rubber-band backend: keeps the current rectangle in React state and
 * exposes it for rendering as an absolutely-positioned div.
 */
function useHtmlRubberBand(): { backend: RubberBandBackend; rect: Rect | null } {
    const [rect, setRect] = useState<Rect | null>(null)
    const backend = useMemo<RubberBandBackend>(
        () => ({
            begin: () => setRect(null),
            update: (r) => setRect(r),
            end: () => setRect(null),
        }),
        [],
    )
    return { backend, rect }
}

/**
 * Overlay that performs rubber-band atom selection while the `rectSelect`
 * tool is active, and forwards all non-(left-drag) interactions to the
 * navigate-tool path. Mounted permanently over the viewport; it is
 * click-through unless that tool is active.
 */
export const RectSelectOverlay: React.FC = () => {
    const activeTool = useActiveToolContext()
    const { activeViewID } = useMolTabState()
    const { cm } = useCueMol()
    const active = activeTool === 'rectSelect'

    const rootRef = useRef<HTMLDivElement>(null)
    const leftRef = useRef<LeftDrag | null>(null)
    const { backend, rect } = useHtmlRubberBand()

    /** DOM clientX/Y -> canvas-local coords (overlay is flush with the canvas). */
    const localCoords = (e: React.MouseEvent): { x: number; y: number } => {
        const r = rootRef.current?.getBoundingClientRect()
        return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
    }

    /** Forward a raw DOM mouse event to the worker, mirroring MolViewPane. */
    const forward = (method: string, domEvent: MouseEvent): void => {
        if (activeViewID == null || !cm) return
        cm.onMouseEvent(activeViewID, method, domEvent)
    }

    const onMouseDown = (e: React.MouseEvent): void => {
        if (e.button === 0) {
            // Left button: defer -- classified as click vs drag on move/up.
            const { x, y } = localCoords(e)
            leftRef.current = { x0: x, y0: y, downEvent: e.nativeEvent, dragging: false }
            return
        }
        // Other buttons (camera pan, context menu) fall back to navigate.
        forward('mouseDown', e.nativeEvent)
    }

    const onMouseMove = (e: React.MouseEvent): void => {
        const L = leftRef.current
        if (!L) {
            forward('mouseMove', e.nativeEvent)
            return
        }
        const { x, y } = localCoords(e)
        if (!L.dragging && Math.hypot(x - L.x0, y - L.y0) > DRAG_THRESHOLD) {
            L.dragging = true
            backend.begin(L.x0, L.y0)
        }
        if (L.dragging) backend.update(normalizeRect(L.x0, L.y0, x, y))
    }

    const onMouseUp = (e: React.MouseEvent): void => {
        const L = leftRef.current
        if (!L) {
            forward('mouseUp', e.nativeEvent)
            return
        }
        leftRef.current = null
        if (L.dragging) {
            // Rubber-band release -> rectangle selection.
            backend.end()
            const { x, y } = localCoords(e)
            const r = normalizeRect(L.x0, L.y0, x, y)
            if (r.width > 0 && r.height > 0 && activeViewID != null && cm) {
                void cm.invokeService('rectSelect', { viewId: activeViewID, ...r })
            }
            return
        }
        // Left click (no drag) -> replay press+release so the navigate tool
        // gets a normal click (atom pick / double-click).
        forward('mouseDown', L.downEvent)
        forward('mouseUp', e.nativeEvent)
    }

    // Leaving the viewport mid-left-interaction cancels it (no commit, no click).
    const onMouseLeave = (): void => {
        if (!leftRef.current) return
        if (leftRef.current.dragging) backend.end()
        leftRef.current = null
    }

    // Suppress the browser context menu; the navigate tool opens its own.
    const onContextMenu = (e: React.MouseEvent): void => {
        e.preventDefault()
    }

    return (
        <div
            ref={rootRef}
            className={`rectsel-overlay${active ? ' active' : ''}`}
            onMouseDown={active ? onMouseDown : undefined}
            onMouseMove={active ? onMouseMove : undefined}
            onMouseUp={active ? onMouseUp : undefined}
            onMouseLeave={active ? onMouseLeave : undefined}
            onContextMenu={active ? onContextMenu : undefined}
        >
            {rect && (
                <div
                    className="rectsel-rubber-band"
                    style={{
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                    }}
                />
            )}
        </div>
    )
}
