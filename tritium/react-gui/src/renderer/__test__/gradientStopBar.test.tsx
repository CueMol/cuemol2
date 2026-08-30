/**
 * Pin the GradientStopBar interaction contract (mouse synthesis, no canvas
 * assertions -- jsdom):
 *
 *   - bare click on a marker selects it and commits nothing.
 *   - horizontal drag: onDragStart once, onPreview per frame with the moved
 *     value, onCommit(stops, 'move') on release.
 *   - keepRatio drag routes through the UXP rescale (endpoints anchored).
 *   - vertical drag beyond the delete threshold previews the removal and
 *     commits (stops, 'delete') + clears the selection.
 *   - Esc during a drag calls onAbort and suppresses the commit.
 *   - click on empty lane space inserts an interpolated stop
 *     ((stops, 'add') + selects it).
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

import {
    GradientStopBar,
    type GradientHistogram,
} from '@renderer/h3-kit/gradient'
import type { GradientStop } from '@renderer/h3-kit/gradient'
import { mountTree } from './helpers/testHarness'

// jsdom has no ResizeObserver; the histogram strip observes its parent.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverStub

const STOPS: GradientStop[] = [
    { value: 0, hex: '#FF0000' },
    { value: 5, hex: '#00FF00' },
    { value: 10, hex: '#0000FF' },
]

function pinLaneRect(container: HTMLElement) {
    const lane = container.querySelector('.mg-stop-lane') as HTMLElement
    lane.getBoundingClientRect = () =>
        ({
            left: 0, top: 20, right: 200, bottom: 36,
            width: 200, height: 16, x: 0, y: 20,
            toJSON: () => ({}),
        }) as DOMRect
    return lane
}

function mouse(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY })
}

function setup(overrides?: {
    stops?: GradientStop[]
    domain?: { min: number; max: number }
    keepRatio?: boolean
    selectedIndex?: number | null
    histogram?: GradientHistogram | null
    onDomainChange?: ReturnType<typeof vi.fn>
}) {
    const onSelect = vi.fn()
    const onDragStart = vi.fn()
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    const onAbort = vi.fn()
    const tree = mountTree(
        <GradientStopBar
            stops={overrides?.stops ?? STOPS}
            domain={overrides?.domain ?? { min: 0, max: 10 }}
            selectedIndex={overrides?.selectedIndex ?? null}
            histogram={overrides?.histogram ?? null}
            keepRatio={overrides?.keepRatio ?? false}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onPreview={onPreview}
            onCommit={onCommit}
            onAbort={onAbort}
            onDomainChange={overrides?.onDomainChange}
        />,
    )
    const lane = pinLaneRect(tree.container)
    const markers = tree.container.querySelectorAll('.mg-stop-marker')
    return {
        ...tree, lane, markers,
        onSelect, onDragStart, onPreview, onCommit, onAbort,
    }
}

const HISTOGRAM: GradientHistogram = {
    bins: [1, 2, 3, 4],
    nmax: 4,
    globalNmax: null,
    domain: { min: 0, max: 10 },
}

function pinHistoRect(container: HTMLElement): HTMLElement {
    const histo = container.querySelector('.mg-histo') as HTMLElement
    histo.getBoundingClientRect = () =>
        ({
            left: 0, top: 0, right: 200, bottom: 48,
            width: 200, height: 48, x: 0, y: 0,
            toJSON: () => ({}),
        }) as DOMRect
    return histo
}

describe('GradientStopBar', () => {
    it('renders one marker per stop and the min/max labels', () => {
        const t = setup()
        expect(t.markers).toHaveLength(3)
        expect(t.container.textContent).toContain('0.00')
        expect(t.container.textContent).toContain('10.00')
        t.unmount()
    })

    it('bare click on a marker selects without committing', async () => {
        const t = setup()
        await act(async () => {
            t.markers[1].dispatchEvent(mouse('mousedown', 100, 28))
        })
        await act(async () => {
            document.dispatchEvent(mouse('mouseup', 100, 28))
        })
        expect(t.onSelect).toHaveBeenCalledWith(1)
        expect(t.onDragStart).not.toHaveBeenCalled()
        expect(t.onPreview).not.toHaveBeenCalled()
        expect(t.onCommit).not.toHaveBeenCalled()
        t.unmount()
    })

    it('horizontal drag previews the move and commits on release', async () => {
        const t = setup()
        await act(async () => {
            t.markers[1].dispatchEvent(mouse('mousedown', 100, 28))
        })
        await act(async () => {
            document.dispatchEvent(mouse('mousemove', 150, 28))
        })
        expect(t.onDragStart).toHaveBeenCalledTimes(1)
        expect(t.onPreview).toHaveBeenCalledTimes(1)
        // marker 1 was at x=100 (value 5); +50px in a 200px lane over
        // [0,10] moves it to value 7.5
        const previewed = t.onPreview.mock.calls[0][0] as GradientStop[]
        expect(previewed.map((s) => s.value)).toEqual([0, 7.5, 10])
        expect(previewed[1].hex).toBe('#00FF00')

        await act(async () => {
            document.dispatchEvent(mouse('mouseup', 150, 28))
        })
        expect(t.onCommit).toHaveBeenCalledTimes(1)
        const [stops, gesture] = t.onCommit.mock.calls[0]
        expect(gesture).toBe('move')
        expect((stops as GradientStop[]).map((s) => s.value)).toEqual([0, 7.5, 10])
        t.unmount()
    })

    it('keepRatio drag rescales the other side, endpoints anchored', async () => {
        const t = setup({
            stops: [
                { value: 0, hex: '#FF0000' },
                { value: 2, hex: '#FFFF00' },
                { value: 5, hex: '#00FF00' },
                { value: 10, hex: '#0000FF' },
            ],
            keepRatio: true,
        })
        // marker 2 (value 5, x=100) -> +20px = value 6
        await act(async () => {
            t.markers[2].dispatchEvent(mouse('mousedown', 100, 28))
        })
        await act(async () => {
            document.dispatchEvent(mouse('mousemove', 120, 28))
        })
        const previewed = t.onPreview.mock.calls[0][0] as GradientStop[]
        // left side rescales (0..5 -> 0..6): 2 -> 2.4; endpoints stay
        const values = previewed.map((s) => s.value)
        expect(values[0]).toBe(0)
        expect(values[1]).toBeCloseTo(2.4)
        expect(values[2]).toBeCloseTo(6)
        expect(values[3]).toBe(10)
        t.unmount()
    })

    it('dragging below the lane arms deletion and commits it', async () => {
        const t = setup()
        await act(async () => {
            t.markers[1].dispatchEvent(mouse('mousedown', 100, 28))
        })
        await act(async () => {
            // lane bottom is 36; 36 + 41 = 77 clears DELETE_DRAG_THRESHOLD_PX
            document.dispatchEvent(mouse('mousemove', 100, 77))
        })
        const previewed = t.onPreview.mock.calls.at(-1)![0] as GradientStop[]
        expect(previewed.map((s) => s.value)).toEqual([0, 10])
        expect(t.container.querySelector('.mg-stop-marker.is-ghost')).not.toBeNull()

        await act(async () => {
            document.dispatchEvent(mouse('mouseup', 100, 77))
        })
        expect(t.onCommit).toHaveBeenCalledTimes(1)
        const [stops, gesture] = t.onCommit.mock.calls[0]
        expect(gesture).toBe('delete')
        expect((stops as GradientStop[]).map((s) => s.value)).toEqual([0, 10])
        expect(t.onSelect).toHaveBeenLastCalledWith(null)
        t.unmount()
    })

    it('Esc during a drag aborts and suppresses the commit', async () => {
        const t = setup()
        await act(async () => {
            t.markers[1].dispatchEvent(mouse('mousedown', 100, 28))
        })
        await act(async () => {
            document.dispatchEvent(mouse('mousemove', 150, 28))
        })
        await act(async () => {
            document.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
            )
        })
        expect(t.onAbort).toHaveBeenCalledTimes(1)
        await act(async () => {
            document.dispatchEvent(mouse('mouseup', 150, 28))
        })
        expect(t.onCommit).not.toHaveBeenCalled()
        t.unmount()
    })

    it('click on empty lane space inserts an interpolated stop', async () => {
        const t = setup()
        await act(async () => {
            // x=50 = value 2.5, between #FF0000@0 and #00FF00@5 -> #808000
            t.lane.dispatchEvent(mouse('mousedown', 50, 28))
        })
        expect(t.onCommit).toHaveBeenCalledTimes(1)
        const [stops, gesture] = t.onCommit.mock.calls[0]
        expect(gesture).toBe('add')
        const added = stops as GradientStop[]
        expect(added.map((s) => s.value)).toEqual([0, 2.5, 5, 10])
        expect(added[1].hex).toBe('#808000')
        expect(t.onSelect).toHaveBeenCalledWith(1)
        t.unmount()
    })

    it('positions markers by the domain prop, independent of the stop range', () => {
        // stops span 0..10 but the view domain is 0..20: value 10 sits at 50%
        const t = setup({ domain: { min: 0, max: 20 } })
        const styles = Array.from(t.markers).map(
            (m) => (m as HTMLElement).style.left,
        )
        expect(styles).toEqual(['0%', '25%', '50%'])
        // labels show the view domain, not the stop range
        expect(t.container.textContent).toContain('20.00')
        t.unmount()
    })

    it('click-add on empty lane space uses the domain for the value', async () => {
        const t = setup({ domain: { min: 0, max: 20 } })
        await act(async () => {
            // x=150 of 200px lane over [0,20] = value 15 (beyond the stop max)
            t.lane.dispatchEvent(mouse('mousedown', 150, 28))
        })
        const [stops, gesture] = t.onCommit.mock.calls[0]
        expect(gesture).toBe('add')
        expect((stops as GradientStop[]).map((s) => s.value)).toEqual([0, 5, 10, 15])
        t.unmount()
    })

    it('stops outside the domain are not rendered', () => {
        const t = setup({ domain: { min: 2, max: 8 } })
        // only the middle stop (value 5) is inside [2, 8]
        expect(t.markers).toHaveLength(1)
        expect((t.markers[0] as HTMLElement).dataset.index).toBe('1')
        t.unmount()
    })

    it('a hidden edge stop does not swallow lane-edge clicks', async () => {
        const t = setup({ domain: { min: 2, max: 8 } })
        await act(async () => {
            // x=2 is where the hidden stop (value 0) used to pin; the click
            // must ADD a stop at value ~2.1 instead of doing nothing
            t.lane.dispatchEvent(mouse('mousedown', 2, 28))
        })
        expect(t.onCommit).toHaveBeenCalledTimes(1)
        const [stops, gesture] = t.onCommit.mock.calls[0]
        expect(gesture).toBe('add')
        expect((stops as GradientStop[])).toHaveLength(4)
        expect((stops as GradientStop[])[1].value).toBeCloseTo(2.06, 1)
        t.unmount()
    })

    // --- histogram view-range gestures ---

    it('pinch (ctrlKey wheel) zooms anchored at the cursor', async () => {
        const onDomainChange = vi.fn()
        const t = setup({ histogram: HISTOGRAM, onDomainChange })
        const histo = pinHistoRect(t.container)
        await act(async () => {
            histo.dispatchEvent(new WheelEvent('wheel', {
                bubbles: true, cancelable: true,
                ctrlKey: true, deltaY: -100, clientX: 100, clientY: 24,
            }))
        })
        expect(onDomainChange).toHaveBeenCalledTimes(1)
        const d = onDomainChange.mock.calls[0][0]
        // anchor = value 5 at x=100; span shrinks by exp(-1)
        const factor = Math.exp(-1)
        expect(d.min).toBeCloseTo(5 - 5 * factor)
        expect(d.max).toBeCloseTo(5 + 5 * factor)
        t.unmount()
    })

    it('horizontal wheel pans the view', async () => {
        const onDomainChange = vi.fn()
        const t = setup({ histogram: HISTOGRAM, onDomainChange })
        const histo = pinHistoRect(t.container)
        await act(async () => {
            histo.dispatchEvent(new WheelEvent('wheel', {
                bubbles: true, cancelable: true,
                deltaX: 50, deltaY: 0, clientX: 100,
            }))
        })
        // 50px of a 200px strip over span 10 -> shift +2.5
        expect(onDomainChange).toHaveBeenCalledWith({ min: 2.5, max: 12.5 })
        t.unmount()
    })

    it('hand-drag pans (content follows the pointer) with grabbing state', async () => {
        const onDomainChange = vi.fn()
        const t = setup({ histogram: HISTOGRAM, onDomainChange })
        const histo = pinHistoRect(t.container)
        expect(histo.classList.contains('is-pannable')).toBe(true)
        await act(async () => {
            histo.dispatchEvent(mouse('mousedown', 100, 24))
        })
        expect(
            (t.container.querySelector('.mg-histo') as HTMLElement)
                .classList.contains('is-panning'),
        ).toBe(true)
        await act(async () => {
            document.dispatchEvent(mouse('mousemove', 150, 24))
        })
        // +50px drag -> content follows hand -> domain shifts left by 2.5
        expect(onDomainChange).toHaveBeenCalledWith({ min: -2.5, max: 7.5 })
        await act(async () => {
            document.dispatchEvent(mouse('mouseup', 150, 24))
        })
        expect(
            (t.container.querySelector('.mg-histo') as HTMLElement)
                .classList.contains('is-panning'),
        ).toBe(false)
        t.unmount()
    })

    it('repeated wheel pans preserve the span exactly (no fp drift)', async () => {
        const domains: Array<{ min: number; max: number }> = []
        const onDomainChange = vi.fn((d) => domains.push(d))
        // an awkward domain where shifting both ends would drift the span
        const start = { min: 1234.5678901, max: 1234.6678901 }
        const t = setup({
            histogram: HISTOGRAM, onDomainChange, domain: start,
        })
        const histo = pinHistoRect(t.container)
        // feed the previous result back in, as the real parent does
        let cur = start
        for (let i = 0; i < 30; i++) {
            await act(async () => {
                t.root.render(
                    <GradientStopBar
                        stops={STOPS} domain={cur} selectedIndex={null}
                        histogram={HISTOGRAM} keepRatio={false}
                        onSelect={vi.fn()} onDragStart={vi.fn()} onPreview={vi.fn()}
                        onCommit={vi.fn()} onAbort={vi.fn()}
                        onDomainChange={onDomainChange}
                    />,
                )
            })
            await act(async () => {
                histo.dispatchEvent(new WheelEvent('wheel', {
                    bubbles: true, cancelable: true,
                    deltaX: 7, deltaY: 0, clientX: 100,
                }))
            })
            cur = domains[domains.length - 1]
        }
        const span0 = start.max - start.min
        const spanN = cur.max - cur.min
        expect(spanN).toBe(span0)
        // and it really did move
        expect(cur.min).toBeGreaterThan(start.min)
        t.unmount()
    })

    it('gestures are inert without onDomainChange', async () => {
        const t = setup({ histogram: HISTOGRAM })
        const histo = pinHistoRect(t.container)
        expect(histo.classList.contains('is-pannable')).toBe(false)
        await act(async () => {
            histo.dispatchEvent(mouse('mousedown', 100, 24))
            document.dispatchEvent(mouse('mousemove', 150, 24))
            document.dispatchEvent(mouse('mouseup', 150, 24))
        })
        expect(t.onCommit).not.toHaveBeenCalled()
        t.unmount()
    })

    it('extra fields on stops ride through previews and commits', async () => {
        const t = setup({
            stops: [
                { value: 0, hex: '#FF0000', color: 'red' } as GradientStop,
                { value: 10, hex: '#FFFFFF', color: 'white' } as GradientStop,
            ],
        })
        await act(async () => {
            t.markers[0].dispatchEvent(mouse('mousedown', 0, 28))
        })
        await act(async () => {
            document.dispatchEvent(mouse('mousemove', 40, 28))
        })
        await act(async () => {
            document.dispatchEvent(mouse('mouseup', 40, 28))
        })
        const [stops] = t.onCommit.mock.calls[0]
        expect((stops as Array<{ color?: string }>)[0].color).toBe('red')
        t.unmount()
    })
})
