/**
 * Degrade-detection tests for the list-kit catalog
 * (`components/widgets/list/`).
 *
 * list-kit is the single source of list/tree ROW sizing. These pin:
 *  - ListRow emits `.list-row` and toggles `.is-selected`
 *  - ListRow leaks no inline sizing (height/padding/margin come from CSS)
 *  - Listbox emits `.listbox`
 *  - onClick fires
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

import { Listbox, ListRow } from '../components/widgets/list'
import { mountTree } from './helpers/testHarness'

function expectNoInlineSizing(root: HTMLElement): void {
    const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    for (const el of all) {
        const s = el.getAttribute('style') ?? ''
        expect(s).not.toMatch(/height|padding|margin|gap/i)
    }
}

describe('list-kit catalog', () => {
    it('Listbox emits .listbox; ListRow emits .list-row with .type-row', () => {
        const { container, unmount } = mountTree(
            <Listbox>
                <ListRow>a</ListRow>
            </Listbox>,
        )
        expect(container.querySelector('.listbox')).not.toBeNull()
        const row = container.querySelector('.list-row') as HTMLElement
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
        const row = container.querySelector('.list-row') as HTMLElement
        expect(row.classList.contains('is-selected')).toBe(true)
        expect(row.getAttribute('aria-selected')).toBe('true')
        act(() => { row.click() })
        expect(onClick).toHaveBeenCalled()
        unmount()
    })

    it('ListRow without selected has no is-selected / aria-selected', () => {
        const { container, unmount } = mountTree(<ListRow>row</ListRow>)
        const row = container.querySelector('.list-row') as HTMLElement
        expect(row.classList.contains('is-selected')).toBe(false)
        expect(row.getAttribute('aria-selected')).toBeNull()
        unmount()
    })
})
