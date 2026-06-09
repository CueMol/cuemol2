/**
 * @file components/RectSelectOverlay.tsx
 * @description Transparent overlay layered over the 3D viewport that handles
 * rubber-band (rectangle) atom selection for the `rectSelect` tool.
 *
 * Design: the overlay captures pointer events only while the `rectSelect`
 * tool is active (`pointer-events: auto`); otherwise it is click-through
 * (`pointer-events: none`) so the canvas keeps receiving camera-drag events.
 * Because the canvas never sees the drag while selecting, no C++-side camera
 * rotation occurs -- this avoids the event-manager return-value race that
 * UXP relied on (see the rectsel plan / `View::fireInDevEvent`).
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
 * tool is active. Mounts permanently over the viewport; it is click-through
 * unless that tool is active.
 */
export const RectSelectOverlay: React.FC = () => {
    const activeTool = useActiveToolContext()
    const { activeViewID } = useMolTabState()
    const { cm } = useCueMol()
    const active = activeTool === 'rectSelect'

    const rootRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<{ x0: number; y0: number } | null>(null)
    const { backend, rect } = useHtmlRubberBand()

    /** DOM clientX/Y -> canvas-local coords (overlay is flush with the canvas). */
    const localCoords = (e: React.MouseEvent): { x: number; y: number } => {
        const r = rootRef.current?.getBoundingClientRect()
        return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
    }

    const onMouseDown = (e: React.MouseEvent): void => {
        if (e.button !== 0) return // left button only
        const { x, y } = localCoords(e)
        dragRef.current = { x0: x, y0: y }
        backend.begin(x, y)
    }

    const onMouseMove = (e: React.MouseEvent): void => {
        if (!dragRef.current) return
        const { x, y } = localCoords(e)
        backend.update(normalizeRect(dragRef.current.x0, dragRef.current.y0, x, y))
    }

    const onMouseUp = (e: React.MouseEvent): void => {
        const drag = dragRef.current
        dragRef.current = null
        backend.end()
        if (!drag) return
        const { x, y } = localCoords(e)
        const r = normalizeRect(drag.x0, drag.y0, x, y)
        // A zero-area drag is a click, not a rectangle -- ignore.
        if (r.width <= 0 || r.height <= 0) return
        if (activeViewID == null || !cm) return
        void cm.invokeService('rectSelect', {
            viewId: activeViewID,
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
        })
    }

    // Leaving the viewport mid-drag cancels the selection (no commit).
    const onMouseLeave = (): void => {
        if (!dragRef.current) return
        dragRef.current = null
        backend.end()
    }

    return (
        <div
            ref={rootRef}
            className={`rectsel-overlay${active ? ' active' : ''}`}
            onMouseDown={active ? onMouseDown : undefined}
            onMouseMove={active ? onMouseMove : undefined}
            onMouseUp={active ? onMouseUp : undefined}
            onMouseLeave={active ? onMouseLeave : undefined}
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
