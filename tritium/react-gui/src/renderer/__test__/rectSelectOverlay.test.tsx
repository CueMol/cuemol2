/**
 * Degrade-detection tests for `RectSelectOverlay`.
 *
 * Pins the renderer-side drag-to-service contract and the navigate-tool
 * fallback routing:
 *   - the overlay is click-through (no `active` class, no handlers) unless the
 *     `rectSelect` tool is active
 *   - a left-button drag while active fires `cm.invokeService('rectSelect',
 *     bounds)` once, with top-left-normalized canvas-local bounds, and is NOT
 *     forwarded to the C++ view (so the camera does not rotate)
 *   - a left-button click (no drag) is replayed to the view via
 *     `cm.onMouseEvent` (navigate-tool atom pick), not a rect select
 *   - non-left buttons (camera / context menu) are forwarded to the view
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { RectSelectOverlay } from '@renderer/features/molview/RectSelectOverlay'
import { GES_PINCH } from '@renderer/worker/shared/gestureAxes'
import type { ToolId } from '@renderer/data/viewportTools'

void React
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { invokeService, onMouseEvent, onWheelEvent, onGestureEvent } = vi.hoisted(() => ({
    invokeService: vi.fn(),
    onMouseEvent: vi.fn(),
    onWheelEvent: vi.fn(),
    onGestureEvent: vi.fn(),
}))

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({
        cueMolReady: true,
        cm: { invokeService, onMouseEvent, onWheelEvent, onGestureEvent },
    }),
}))
// The active tool is owned by its context; the test sets it per mount.
const currentTool = vi.hoisted(() => ({ id: 'navigate' as string }))
vi.mock('@renderer/contexts/ActiveToolContext', () => ({
    useActiveToolContext: () => currentTool.id,
    useSetActiveTool: () => () => undefined,
}))
vi.mock('@renderer/state/workspace', () => ({
    // The active view as the workspace reports it (undefined = no molview).
    useActiveScene: () => ({
        activeMolViewId: 7,
        activeSceneId: undefined,
        hasScene: true,
    }),
}))

let root: Root
let container: HTMLDivElement

function mount(tool: ToolId): HTMLDivElement {
    currentTool.id = tool
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
        root = createRoot(container)
        root.render(
            <RectSelectOverlay />,
        )
    })
    return container.querySelector('.rectsel-overlay') as HTMLDivElement
}

function fire(
    el: HTMLElement,
    type: string,
    x: number,
    y: number,
    opts: { button?: number; shiftKey?: boolean } = {},
): void {
    act(() => {
        el.dispatchEvent(
            new MouseEvent(type, {
                bubbles: true,
                clientX: x,
                clientY: y,
                button: opts.button ?? 0,
                shiftKey: opts.shiftKey ?? false,
            }),
        )
    })
}

function fireWheel(
    el: HTMLElement,
    opts: { deltaY?: number; ctrlKey?: boolean } = {},
): void {
    act(() => {
        el.dispatchEvent(
            new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                deltaY: opts.deltaY ?? 100,
                ctrlKey: opts.ctrlKey ?? false,
            }),
        )
    })
}

beforeEach(() => {
    invokeService.mockReset()
    // The real bridge always returns a promise; the overlay chains on it.
    invokeService.mockResolvedValue(undefined)
    onMouseEvent.mockReset()
    onWheelEvent.mockReset()
    onGestureEvent.mockReset()
})

afterEach(() => {
    act(() => {
        root.unmount()
    })
    document.body.removeChild(container)
})

describe('RectSelectOverlay', () => {
    it('is click-through and ignores events when tool is not rectSelect', () => {
        const overlay = mount('navigate')
        expect(overlay.classList.contains('active')).toBe(false)
        fire(overlay, 'mousedown', 10, 20)
        fire(overlay, 'mousemove', 50, 60)
        fire(overlay, 'mouseup', 50, 60)
        expect(invokeService).not.toHaveBeenCalled()
        expect(onMouseEvent).not.toHaveBeenCalled()
    })

    it('invokes rectSelect once with normalized bounds on a left drag, no camera forward', () => {
        const overlay = mount('rectSelect')
        expect(overlay.classList.contains('active')).toBe(true)
        fire(overlay, 'mousedown', 10, 20)
        fire(overlay, 'mousemove', 50, 60)
        fire(overlay, 'mouseup', 50, 60)
        expect(invokeService).toHaveBeenCalledTimes(1)
        expect(invokeService).toHaveBeenCalledWith('rectSelect', {
            viewId: 7,
            left: 10,
            top: 20,
            width: 40,
            height: 40,
            mode: 'replace',
        })
        // A rubber-band drag must not reach the C++ view (would rotate camera).
        expect(onMouseEvent).not.toHaveBeenCalled()
    })

    it('normalizes a bottom-right -> top-left drag', () => {
        const overlay = mount('rectSelect')
        fire(overlay, 'mousedown', 50, 60)
        fire(overlay, 'mousemove', 10, 20)
        fire(overlay, 'mouseup', 10, 20)
        expect(invokeService).toHaveBeenCalledWith('rectSelect', {
            viewId: 7,
            left: 10,
            top: 20,
            width: 40,
            height: 40,
            mode: 'replace',
        })
    })

    it('shift+drag selects in add mode', () => {
        const overlay = mount('rectSelect')
        fire(overlay, 'mousedown', 10, 20)
        fire(overlay, 'mousemove', 50, 60)
        fire(overlay, 'mouseup', 50, 60, { shiftKey: true })
        expect(invokeService).toHaveBeenCalledWith('rectSelect', {
            viewId: 7,
            left: 10,
            top: 20,
            width: 40,
            height: 40,
            mode: 'add',
        })
    })

    it('lasso tool: drag invokes lassoSelect with the sampled polygon', () => {
        const overlay = mount('lassoSelect')
        expect(overlay.classList.contains('active')).toBe(true)
        expect(overlay.classList.contains('lasso')).toBe(true)
        fire(overlay, 'mousedown', 0, 0)
        fire(overlay, 'mousemove', 20, 0)
        fire(overlay, 'mousemove', 20, 20)
        fire(overlay, 'mousemove', 0, 20)
        fire(overlay, 'mouseup', 0, 20)
        expect(invokeService).toHaveBeenCalledTimes(1)
        const [name, payload] = invokeService.mock.calls[0]
        expect(name).toBe('lassoSelect')
        expect(payload.viewId).toBe(7)
        expect(payload.mode).toBe('replace')
        expect(payload.points.length).toBeGreaterThanOrEqual(3)
        expect(onMouseEvent).not.toHaveBeenCalled()
    })

    it('forwards a left click (no drag) to the view instead of selecting', () => {
        const overlay = mount('rectSelect')
        fire(overlay, 'mousedown', 30, 30)
        fire(overlay, 'mouseup', 30, 30)
        expect(invokeService).not.toHaveBeenCalled()
        // Replayed press + release so the navigate tool sees a click.
        expect(onMouseEvent).toHaveBeenCalledTimes(2)
        expect(onMouseEvent.mock.calls[0][0]).toBe(7)
        expect(onMouseEvent.mock.calls[0][1]).toBe('mouseDown')
        expect(onMouseEvent.mock.calls[1][1]).toBe('mouseUp')
    })

    it('forwards non-left buttons (context menu / camera) to the view', () => {
        const overlay = mount('rectSelect')
        fire(overlay, 'mousedown', 40, 40, { button: 2 }) // right button
        expect(invokeService).not.toHaveBeenCalled()
        expect(onMouseEvent).toHaveBeenCalledTimes(1)
        expect(onMouseEvent.mock.calls[0][1]).toBe('mouseDown')
    })

    it('forwards a plain wheel to the view (navigation zoom) while a select tool is active', () => {
        const overlay = mount('rectSelect')
        fireWheel(overlay, { deltaY: 120 })
        expect(onWheelEvent).toHaveBeenCalledTimes(1)
        expect(onWheelEvent.mock.calls[0][0]).toBe(7)
        expect(onGestureEvent).not.toHaveBeenCalled()
    })

    it('forwards ctrl+wheel (trackpad pinch) as a GES_PINCH gesture', () => {
        const overlay = mount('lassoSelect')
        fireWheel(overlay, { deltaY: -40, ctrlKey: true })
        expect(onGestureEvent).toHaveBeenCalledTimes(1)
        expect(onGestureEvent.mock.calls[0][0]).toBe(7)
        expect(onGestureEvent.mock.calls[0][1]).toBe(GES_PINCH)
        expect(onWheelEvent).not.toHaveBeenCalled()
    })

    it('does not forward wheel when no select tool is active (canvas handles it)', () => {
        const overlay = mount('navigate')
        fireWheel(overlay, { deltaY: 100 })
        expect(onWheelEvent).not.toHaveBeenCalled()
        expect(onGestureEvent).not.toHaveBeenCalled()
    })
})
