/**
 * EditInteractionListDialog wiring contract (UXP `aintr-edit-dlg` port).
 *
 * Pins: renders one row per definition (mode label + atoms), per-row Delete
 * removes it from the working list, OK returns the removed ids via onConfirm,
 * and Cancel resolves null.
 */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { EditInteractionListDialog } from '@renderer/dialogs/EditInteractionListDialog'
import { mountTree } from '@renderer/__test__/helpers/testHarness'
import type { AtomIntrDefEntry } from '@renderer/worker/server/services/atomIntrEdit.service'

function entries(): AtomIntrDefEntry[] {
    return [
        { id: 0, mode: 1, atoms: ['A.10.CA', 'A.20.CA'] },
        { id: 1, mode: 3, atoms: ['a', 'b', 'c', 'd'] },
    ]
}

function rows(): HTMLElement[] {
    return Array.from(document.body.querySelectorAll('[role="table"] [role="row"]')) as HTMLElement[]
}

function button(label: string): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => b.textContent === label,
    ) as HTMLButtonElement
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('EditInteractionListDialog', () => {
    it('renders a row per definition with mode label + atoms', () => {
        const { unmount } = mountTree(
            <EditInteractionListDialog
                visible
                rendName="atomintr1"
                entries={entries()}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        )
        expect(rows()).toHaveLength(2)
        expect(document.body.textContent).toContain('Distance')
        expect(document.body.textContent).toContain('Torsion')
        expect(document.body.textContent).toContain('A.10.CA')
        unmount()
    })

    it('OK returns no removals when nothing is deleted', () => {
        const onConfirm = vi.fn()
        const { unmount } = mountTree(
            <EditInteractionListDialog
                visible
                rendName="atomintr1"
                entries={entries()}
                onConfirm={onConfirm}
                onCancel={vi.fn()}
            />,
        )
        act(() => button('OK').click())
        expect(onConfirm).toHaveBeenCalledWith({ removeIds: [] })
        unmount()
    })

    it('deleting a row then OK returns that id in removeIds', () => {
        const onConfirm = vi.fn()
        const { unmount } = mountTree(
            <EditInteractionListDialog
                visible
                rendName="atomintr1"
                entries={entries()}
                onConfirm={onConfirm}
                onCancel={vi.fn()}
            />,
        )
        const del = document.body.querySelector(
            '[aria-label="Delete interaction 1"]',
        ) as HTMLButtonElement
        act(() => del.click())
        expect(rows()).toHaveLength(1)
        act(() => button('OK').click())
        expect(onConfirm).toHaveBeenCalledWith({ removeIds: [1] })
        unmount()
    })

    it('Cancel resolves null', () => {
        const onCancel = vi.fn()
        const { unmount } = mountTree(
            <EditInteractionListDialog
                visible
                rendName="atomintr1"
                entries={entries()}
                onConfirm={vi.fn()}
                onCancel={onCancel}
            />,
        )
        act(() => button('Cancel').click())
        expect(onCancel).toHaveBeenCalled()
        unmount()
    })
})
