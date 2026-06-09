/**
 * Degrade-detection tests for `RectSelectOverlay`.
 *
 * Pins the renderer-side drag-to-service contract:
 *   - the overlay is click-through (no `active` class, no handlers) unless the
 *     `rectSelect` tool is active
 *   - a drag while active fires `cm.invokeService('rectSelect', bounds)` once,
 *     with top-left-normalized bounds in canvas-local coords
 *   - a zero-area click does not select
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { ActiveToolProvider } from '../contexts/ActiveToolContext'
import { RectSelectOverlay } from '../components/RectSelectOverlay'
import type { ToolId } from '../data/viewportTools'

void React
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { invokeService } = vi.hoisted(() => ({ invokeService: vi.fn() }))

vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: { invokeService } }),
}))
vi.mock('../hooks/useMolTab', () => ({
    useMolTabState: () => ({ activeViewID: 7, molTabEntries: [] }),
}))

let root: Root
let container: HTMLDivElement

function mount(tool: ToolId): HTMLDivElement {
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
        root = createRoot(container)
        root.render(
            <ActiveToolProvider activeTool={tool}>
                <RectSelectOverlay />
            </ActiveToolProvider>,
        )
    })
    return container.querySelector('.rectsel-overlay') as HTMLDivElement
}

function fire(el: HTMLElement, type: string, x: number, y: number, button = 0): void {
    act(() => {
        el.dispatchEvent(
            new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button }),
        )
    })
}

beforeEach(() => {
    invokeService.mockReset()
})

afterEach(() => {
    act(() => {
        root.unmount()
    })
    document.body.removeChild(container)
})

describe('RectSelectOverlay', () => {
    it('is click-through and ignores drags when tool is not rectSelect', () => {
        const overlay = mount('navigate')
        expect(overlay.classList.contains('active')).toBe(false)
        fire(overlay, 'mousedown', 10, 20)
        fire(overlay, 'mousemove', 50, 60)
        fire(overlay, 'mouseup', 50, 60)
        expect(invokeService).not.toHaveBeenCalled()
    })

    it('invokes rectSelect once with normalized bounds on drag-release', () => {
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
        })
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
        })
    })

    it('ignores a zero-area click (no drag)', () => {
        const overlay = mount('rectSelect')
        fire(overlay, 'mousedown', 30, 30)
        fire(overlay, 'mouseup', 30, 30)
        expect(invokeService).not.toHaveBeenCalled()
    })
})
