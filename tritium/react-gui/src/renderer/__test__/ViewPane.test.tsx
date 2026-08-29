/**
 * Tests for ViewPane (UXP `panel.fakedial` port).
 *
 * Contract pinned here:
 *   1. renders the four sections (Rotation / Translation / Zoom-Slab / Projection)
 *   2. fetches the view transform on mount (getViewXform)
 *   3. a Zoom step commits an ABSOLUTE value via setViewXform
 *   4. a RotX step commits a RELATIVE rotation via rotateView (delta from 0)
 *   5. a TraX step applies a RELATIVE camera-pan via translateView (UXP wheel
 *      parity), not an absolute setViewXform center
 *   6. the Projection controls dispatch the existing view commands (single
 *      source of truth: the same handlers the View menu uses)
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// The event subscription is exercised in useViewXform.test.ts; stub it here so
// these tests are driven purely by mount + explicit user actions.
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

// The pane reads the mirrored view state and writes through the command
// registry; both are provider-owned, so stand them in here.
const viewState = vi.hoisted(() => ({
    viewProjection: false as boolean | null,
    viewCenterMark: 'crosshair' as 'crosshair' | 'axis' | 'none' | null,
    sceneBgColor: null,
    exportAvailable: [] as string[],
}))
const dispatch = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('../state/activeView', () => ({ useActiveViewValues: () => viewState }))
vi.mock('@renderer/hooks/cuemol/useCueMol', async () => (await import('./helpers/paneEnv')).mockCueMolModule())
vi.mock('@renderer/state/workspace', async () => (await import('./helpers/paneEnv')).mockWorkspaceModule())
vi.mock('../commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch }) }))

import { ViewPane } from '../components/panes/ViewPane'
import { mountTree, flushPromises, pressStepArrow } from './helpers/testHarness'
import { withPaneEnv } from './helpers/paneEnv'

const XFORM = {
    ok: true,
    zoom: 50,
    slab: 100,
    distance: 120,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
}

function makeCm() {
    return {
        invokeService: vi.fn((name: string) =>
            name === 'getViewXform' ? Promise.resolve(XFORM) : Promise.resolve({ ok: true }),
        ),
        addEventListener: vi.fn(() => Promise.resolve(1)),
        removeEventListener: vi.fn(() => Promise.resolve()),
    }
}


/** Find a FieldGrid row by its label text. */
function fieldRow(container: HTMLElement, label: string): HTMLElement {
    const row = Array.from(container.querySelectorAll('.h3-form-grid-row')).find(
        (r) => r.querySelector('.h3-form-grid-label')?.textContent === label,
    )
    if (!row) throw new Error(`field row not found: ${label}`)
    return row as HTMLElement
}

function rightArrow(container: HTMLElement, label: string): HTMLElement {
    const btn = fieldRow(container, label).querySelector('.h3-form-drag-arrow-right')
    if (!btn) throw new Error(`right arrow not found: ${label}`)
    return btn as HTMLElement
}

describe('ViewPane', () => {
    let cm: ReturnType<typeof makeCm>
    let view: { container: HTMLElement; unmount(): void }

    beforeEach(async () => {
        dispatch.mockClear()
        cm = makeCm()
        view = mountTree(withPaneEnv(cm, 100, 7, <ViewPane collapsed={false} />))
        await flushPromises() // resolve getViewXform -> enable controls
    })

    afterEach(() => {
        view.unmount()
    })

    it('renders the four transform / projection sections', () => {
        const titles = Array.from(
            view.container.querySelectorAll('.h3-form-field-section-title'),
        ).map((e) => e.textContent)
        expect(titles).toEqual(['Rotation', 'Translation', 'Zoom / Slab', 'Projection'])
    })

    it('fetches the view transform on mount', () => {
        expect(cm.invokeService).toHaveBeenCalledWith('getViewXform', { viewId: 7 })
    })

    it('commits an absolute Zoom value via setViewXform', () => {
        pressStepArrow(rightArrow(view.container, 'Zoom'))
        expect(cm.invokeService).toHaveBeenCalledWith('setViewXform', { viewId: 7, zoom: 51 })
    })

    it('commits a relative RotX rotation via rotateView', () => {
        pressStepArrow(rightArrow(view.container, 'RotX'))
        expect(cm.invokeService).toHaveBeenCalledWith('rotateView', {
            viewId: 7,
            rotX: 1,
            rotY: 0,
            rotZ: 0,
        })
    })

    it('applies a relative TraX camera-pan via translateView (not setViewXform)', () => {
        pressStepArrow(rightArrow(view.container, 'TraX'))
        expect(cm.invokeService).toHaveBeenCalledWith('translateView', {
            viewId: 7,
            dx: 1,
            dy: 0,
            dz: 0,
            dragging: true,
        })
        expect(cm.invokeService).not.toHaveBeenCalledWith(
            'setViewXform',
            expect.objectContaining({ center: expect.anything() }),
        )
    })

    it('routes the Perspective toggle to the view.perspective command', () => {
        const sw = view.container.querySelector('.h3-form-switch input') as HTMLInputElement
        act(() => sw.click())
        expect(dispatch).toHaveBeenCalledWith('view.perspective')
    })

    it('routes the Center mark select to the matching view.centerMark command', () => {
        const cmSel = view.container.querySelector(
            'select[aria-label="Center mark"]',
        ) as HTMLSelectElement
        act(() => {
            cmSel.value = 'axis'
            cmSel.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(dispatch).toHaveBeenCalledWith('view.centerMark.axis')
    })

    it('does not surface a Background control (Scene property, not View)', () => {
        expect(
            view.container.querySelector('select[aria-label="Background colour"]'),
        ).toBeNull()
    })
})
