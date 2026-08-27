/**
 * Pins the observable contract of useBusyCursor: the busy flag shows up on the
 * document root as `data-busy="true"`, which is what the global wait-cursor
 * rule in styles/_base.css keys off. The attribute name and value are the wire
 * format between the hook and the stylesheet, so they are what is asserted.
 *
 * The rising edge is delayed (the pointer is the most intrusive busy signal,
 * so a short operation must not flip it) while the falling edge is immediate;
 * both edges are pinned here with fake timers.
 */

import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import { useBusyCursor } from '../hooks/useBusyCursor'
void React

/** Longer than the hook's rising-edge delay, so the cursor has settled. */
const AFTER_DELAY_MS = 1000

const Probe: React.FC<{ busy: boolean }> = ({ busy }) => {
    useBusyCursor(busy)
    return null
}

function busyAttr(): string | null {
    return document.documentElement.getAttribute('data-busy')
}

describe('useBusyCursor', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        document.documentElement.removeAttribute('data-busy')
    })

    it('sets data-busy on the document root while busy and clears it when idle', () => {
        const { root, unmount } = mountTree(<Probe busy={false} />)
        expect(busyAttr()).toBeNull()

        act(() => root.render(<Probe busy={true} />))
        act(() => void vi.advanceTimersByTime(AFTER_DELAY_MS))
        expect(busyAttr()).toBe('true')

        // Falling edge is immediate -- no timer to advance.
        act(() => root.render(<Probe busy={false} />))
        expect(busyAttr()).toBeNull()

        unmount()
    })

    // A burst of short worker calls must not flicker the pointer: the busy
    // flag has to stay up past the delay before the cursor changes at all.
    it('does not set data-busy for a wait shorter than the rising-edge delay', () => {
        const { root, unmount } = mountTree(<Probe busy={false} />)

        act(() => root.render(<Probe busy={true} />))
        act(() => void vi.advanceTimersByTime(100))
        expect(busyAttr()).toBeNull()

        act(() => root.render(<Probe busy={false} />))
        act(() => void vi.advanceTimersByTime(AFTER_DELAY_MS))
        expect(busyAttr()).toBeNull()

        unmount()
    })

    it('clears data-busy when unmounted while still busy', () => {
        const { unmount } = mountTree(<Probe busy={true} />)
        act(() => void vi.advanceTimersByTime(AFTER_DELAY_MS))
        expect(busyAttr()).toBe('true')

        unmount()
        expect(busyAttr()).toBeNull()
    })
})
