/**
 * Degrade-detection tests for `CountTag` -- the selection hit-count badge.
 *
 * The badge sits inside the compact op buttons, so its width must stay
 * bounded: large counts are abbreviated (regression guard: an unabbreviated
 * count overflowed the button row and wrapped the Angstrom unit onto its own
 * line). Pins the abbreviation thresholds, the exact-count tooltip, and the
 * render-nothing / warning-intent states.
 */
import React from 'react'
import { describe, it, expect } from 'vitest'

void React

import { CountTag } from '@renderer/h3-kit/MolSelList'
import { mountTree } from './helpers/testHarness'

function badge(count: Parameters<typeof CountTag>[0]['count']): HTMLElement | null {
    const { container } = mountTree(<CountTag count={count} />)
    return container.querySelector('.selbuilder-count')
}

/** Blueprint puts `htmlTitle` on the Tag's inner text span, not its root. */
function tooltip(el: HTMLElement): string | null {
    return el.querySelector('[title]')?.getAttribute('title') ?? null
}

describe('CountTag', () => {
    it('renders nothing when the count is unavailable', () => {
        expect(badge(undefined)).toBeNull()
        expect(badge(null)).toBeNull()
    })

    it('shows small counts verbatim, with no tooltip', () => {
        const el = badge(9999)!
        expect(el.textContent).toBe('9999')
        expect(tooltip(el)).toBeNull()
    })

    it('abbreviates large counts so the badge stays ~4 characters', () => {
        expect(badge(10_000)!.textContent).toBe('10k')
        expect(badge(123_456)!.textContent).toBe('123k')
        expect(badge(1_234_567)!.textContent).toBe('1.2M')
        expect(badge(12_000_000)!.textContent).toBe('12M')
    })

    it('keeps the exact count reachable as a tooltip when abbreviated', () => {
        expect(tooltip(badge(123_456)!)).toBe('123456')
    })

    it('marks an empty selection with the warning intent', () => {
        expect(badge(0)!.classList.contains('bp5-intent-warning')).toBe(true)
        expect(badge(5)!.classList.contains('bp5-intent-warning')).toBe(false)
    })
})
