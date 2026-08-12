/**
 * Pins the observable contract of useBusyCursor: the busy flag shows up on the
 * document root as `data-busy="true"`, which is what the global wait-cursor
 * rule in styles/_base.css keys off. The attribute name and value are the wire
 * format between the hook and the stylesheet, so they are what is asserted.
 */

import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import { useBusyCursor } from '../hooks/useBusyCursor'
void React

const Probe: React.FC<{ busy: boolean }> = ({ busy }) => {
    useBusyCursor(busy)
    return null
}

function busyAttr(): string | null {
    return document.documentElement.getAttribute('data-busy')
}

describe('useBusyCursor', () => {
    afterEach(() => {
        document.documentElement.removeAttribute('data-busy')
    })

    it('sets data-busy on the document root while busy and clears it when idle', () => {
        const { root, unmount } = mountTree(<Probe busy={false} />)
        expect(busyAttr()).toBeNull()

        act(() => root.render(<Probe busy={true} />))
        expect(busyAttr()).toBe('true')

        act(() => root.render(<Probe busy={false} />))
        expect(busyAttr()).toBeNull()

        unmount()
    })

    it('clears data-busy when unmounted while still busy', () => {
        const { unmount } = mountTree(<Probe busy={true} />)
        expect(busyAttr()).toBe('true')

        unmount()
        expect(busyAttr()).toBeNull()
    })
})
