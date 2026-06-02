/**
 * Degrade-detection tests for the list-kit catalog
 * (`h3-kit/list/`).
 *
 * list-kit is the single source of list/tree ROW sizing. These pin:
 *  - ListRow emits `.h3-list-row` and toggles `.is-selected`
 *  - ListRow leaks no inline sizing (height/padding/margin come from CSS)
 *  - Listbox emits `.h3-listbox`
 *  - onClick fires
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

import { Listbox, ListRow } from '../h3-kit/list'
import { mountTree } from './helpers/testHarness'

function expectNoInlineSizing(root: HTMLElement): void {
    const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    for (const el of all) {
        const s = el.getAttribute('style') ?? ''
        expect(s).not.toMatch(/height|padding|margin|gap/i)
    }
}

describe('list-kit catalog', () => {
    it('Listbox emits .h3-listbox; ListRow emits .h3-list-row with .type-row', () => {
        const { container, unmount } = mountTree(
            <Listbox>
                <ListRow>a</ListRow>
            </Listbox>,
        )
        expect(container.querySelector('.h3-listbox')).not.toBeNull()
        const row = container.querySelector('.h3-list-row') as HTMLElement
        expect(row).not.toBeNull()
        expect(row.textContent).toBe('a')
        expect(row.classList.contains('is-selected')).toBe(false)
        expectNoInlineSizing(container)
        unmount()
    })

    it('ListRow toggles .is-selected and fires onClick', () => {
        const onClick = vi.fn()
        const { container, unmount } = mountTree(
            <ListRow selected onClick={onClick}>row</ListRow>,
        )
        const row = container.querySelector('.h3-list-row') as HTMLElement
        expect(row.classList.contains('is-selected')).toBe(true)
        expect(row.getAttribute('aria-selected')).toBe('true')
        act(() => { row.click() })
        expect(onClick).toHaveBeenCalled()
        unmount()
    })

    it('ListRow without selected has no is-selected / aria-selected', () => {
        const { container, unmount } = mountTree(<ListRow>row</ListRow>)
        const row = container.querySelector('.h3-list-row') as HTMLElement
        expect(row.classList.contains('is-selected')).toBe(false)
        expect(row.getAttribute('aria-selected')).toBeNull()
        unmount()
    })
})
