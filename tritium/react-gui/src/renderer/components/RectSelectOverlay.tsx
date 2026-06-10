/**
 * @file components/RectSelectOverlay.tsx
 * @description Transparent overlay layered over the 3D viewport that handles
 * the drag-selection tools: `rectSelect` (rubber-band rectangle) and
 * `lassoSelect` (freeform polygon).
 *
 * Design: the overlay captures pointer events only while a select tool is
 * active (`pointer-events: auto`); otherwise it is click-through
 * (`pointer-events: none`) so the canvas keeps receiving camera-drag events.
 *
 * While a select tool is active the overlay sits on top of the canvas, so the
 * canvas no longer sees raw mouse events. To keep the navigate-tool
 * interactions usable (atom pick, double-click residue select, right-click
 * context menu, camera pan/rotate via other buttons), the overlay acts as a
 * router that mirrors UXP `navi-toolribbon.js`: it consumes only the
 * left-button *drag* (rubber-band / lasso select, which would otherwise
 * rotate the camera) and forwards every other interaction to the worker via
 * `cm.onMouseEvent`, exactly as `MolViewPane` does in navigate mode. A
 * left-button *click* (press without drag) is also forwarded so the C++ view
 * emits the usual click event and `useNaviClickHandler` (enabled while a
 * select tool is active) handles it.
 *
 * Shift+drag adds the hits to the existing selection (a tritium extension);
 * the cursor switches to `copy` while Shift is held to signal the add mode.
 *
 * The rectangle / lasso shapes are drawn here in the renderer (HTML / SVG).
 */

import React, { useEffect, useRef, useState } from 'react'
import { useActiveToolContext } from '../contexts/ActiveToolContext'
import { useMolTabState } from '../hooks/useMolTab'
import { useCueMol } from '../hooks/useCueMol'
import type { ToolId } from '../data/viewportTools'

/** Drag distance (px) below which a left press is treated as a click, not a drag. */
const DRAG_THRESHOLD = 3
/** Minimum spacing (px) between sampled lasso points, to bound the path size. */
const LASSO_MIN_DIST = 2

type SelectKind = 'rect' | 'lasso'

interface Point {
    x: number
    y: number
}

interface Rect {
    left: number
    top: number
    width: number
    height: number
}

/** Pending left-button interaction: a click until it crosses DRAG_THRESHOLD. */
interface LeftDrag {
    kind: SelectKind
    x0: number
    y0: number
    /** The original mousedown DOM event, replayed on a click (no-drag) release. */
    downEvent: MouseEvent
    dragging: boolean
    /** Accumulated lasso path (kind === 'lasso'). */
    points: Point[]
}

/** Which drag-select kind, if any, a tool maps to. */
function selectKind(tool: ToolId): SelectKind | null {
    if (tool === 'rectSelect') return 'rect'
    if (tool === 'lassoSelect') return 'lasso'
    return null
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
 * Overlay that performs rubber-band / lasso atom selection while a select
 * tool is active, and forwards all non-(left-drag) interactions to the
 * navigate-tool path. Mounted permanently over the viewport; it is
 * click-through unless a select tool is active.
 */
export const RectSelectOverlay: React.FC = () => {
    const activeTool = useActiveToolContext()
    const { activeViewID } = useMolTabState()
    const { cm } = useCueMol()
    const kind = selectKind(activeTool)
    const active = kind !== null

    const rootRef = useRef<HTMLDivElement>(null)
    const leftRef = useRef<LeftDrag | null>(null)
    // Render state: rectangle (rect tool) or polygon path (lasso tool).
    const [rect, setRect] = useState<Rect | null>(null)
    const [lasso, setLasso] = useState<Point[] | null>(null)

    // Track Shift for live cursor feedback (add mode). The actual mode is read
    // from the mouseup event so it always matches the cursor at release.
    const [shiftHeld, setShiftHeld] = useState(false)
    useEffect(() => {
        if (!active) {
            setShiftHeld(false)
            return
        }
        const onKey = (e: KeyboardEvent): void => setShiftHeld(e.shiftKey)
        window.addEventListener('keydown', onKey)
        window.addEventListener('keyup', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            window.removeEventListener('keyup', onKey)
        }
    }, [active])

    /** DOM clientX/Y -> canvas-local coords (overlay is flush with the canvas). */
    const localCoords = (e: React.MouseEvent): Point => {
        const r = rootRef.current?.getBoundingClientRect()
        return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
    }

    /** Forward a raw DOM mouse event to the worker, mirroring MolViewPane. */
    const forward = (method: string, domEvent: MouseEvent): void => {
        if (activeViewID == null || !cm) return
        cm.onMouseEvent(activeViewID, method, domEvent)
    }

    const clearShapes = (): void => {
        setRect(null)
        setLasso(null)
    }

    const onMouseDown = (e: React.MouseEvent): void => {
        if (e.button === 0 && kind) {
            // Left button: defer -- classified as click vs drag on move/up.
            const { x, y } = localCoords(e)
            leftRef.current = {
                kind,
                x0: x,
                y0: y,
                downEvent: e.nativeEvent,
                dragging: false,
                points: [{ x, y }],
            }
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
        }
        if (!L.dragging) return
        if (L.kind === 'rect') {
            setRect(normalizeRect(L.x0, L.y0, x, y))
        } else {
            const last = L.points[L.points.length - 1]
            if (Math.hypot(x - last.x, y - last.y) >= LASSO_MIN_DIST) {
                L.points.push({ x, y })
                setLasso([...L.points])
            }
        }
    }

    const onMouseUp = (e: React.MouseEvent): void => {
        const L = leftRef.current
        if (!L) {
            forward('mouseUp', e.nativeEvent)
            return
        }
        leftRef.current = null
        if (L.dragging) {
            clearShapes()
            if (activeViewID == null || !cm) return
            // Shift = add to the existing selection (read at release).
            const mode = e.shiftKey ? 'add' : 'replace'
            if (L.kind === 'rect') {
                const { x, y } = localCoords(e)
                const r = normalizeRect(L.x0, L.y0, x, y)
                if (r.width > 0 && r.height > 0) {
                    void cm.invokeService('rectSelect', { viewId: activeViewID, ...r, mode })
                }
            } else if (L.points.length >= 3) {
                void cm.invokeService('lassoSelect', {
                    viewId: activeViewID,
                    points: L.points,
                    mode,
                })
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
        if (leftRef.current.dragging) clearShapes()
        leftRef.current = null
    }

    // Suppress the browser context menu; the navigate tool opens its own.
    const onContextMenu = (e: React.MouseEvent): void => {
        e.preventDefault()
    }

    const cls =
        `rectsel-overlay${active ? ' active' : ''}` +
        `${active && shiftHeld ? ' add-mode' : ''}` +
        `${kind === 'lasso' ? ' lasso' : ''}`

    return (
        <div
            ref={rootRef}
            className={cls}
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
            {lasso && lasso.length >= 2 && (
                <svg className="rectsel-lasso" aria-hidden="true">
                    <polygon points={lasso.map((p) => `${p.x},${p.y}`).join(' ')} />
                </svg>
            )}
        </div>
    )
}
