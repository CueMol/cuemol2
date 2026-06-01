/**
 * Degrade-detection tests for `PaintSelCell` (Paint table's inline-edit
 * cell that wraps `MolSelList`).
 *
 * Pins the observable contract:
 *   - typing in the input updates the draft only; no commit happens
 *     until focus leaves the cell entirely
 *   - blurring into a sibling inside the cell (e.g. the picker trigger
 *     button) does NOT commit -- prevents stale-draft commits when the
 *     user opens the picker mid-edit
 *   - blurring into the picker popover (rendered in a portal outside the
 *     cell) also does NOT commit -- the popover is "inside the edit"
 *   - blurring out of the cell commits and pushes the value into the
 *     shared selection history
 *   - picking from the popover updates the draft and commits on the
 *     subsequent outside-blur
 *   - Enter on the input commits and blurs
 *   - changing the external `value` prop re-syncs the draft (event-
 *     driven refetch)
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const mockCm = {
    invokeService: vi.fn(),
}

vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

// MolSelList reads the theme for its popover portal class.
vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { PaintSelCell } from '../components/panes/PaintSelCell'
import { STORAGE_KEY, getHistory } from '../components/widgets/MolSelList/selHistory'
import { mountTree, flushPromises } from './helpers/testHarness'

function getInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input.bp5-input') as HTMLInputElement
}
function getTrigger(container: HTMLElement): HTMLButtonElement {
    return container.querySelector('button[aria-label="Pick selection"]') as HTMLButtonElement
}

function typeInto(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
    )!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Fire a focusout event manually with a chosen `relatedTarget`. jsdom's
 * `.blur()` clears focus but emits a focusout whose `relatedTarget` is
 * always `null`, so to exercise the picker-blur branch we synthesise the
 * event directly.
 */
function fireBlur(target: HTMLElement, relatedTarget: HTMLElement | null): void {
    const ev = new FocusEvent('focusout', { bubbles: true, relatedTarget })
    target.dispatchEvent(ev)
}

/** Click a button/menu-item by visible text, searched in document. */
function clickByText(text: string): void {
    const el = Array.from(document.querySelectorAll('button, .bp5-menu-item')).find(
        (b) => b.textContent?.trim() === text,
    ) as HTMLElement
    el.click()
}

describe('PaintSelCell', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
        mockCm.invokeService.mockReset()
        mockCm.invokeService.mockImplementation((name: string) => {
            if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [] })
            if (name === 'validateSelection') return Promise.resolve({ ok: true })
            return Promise.resolve(null)
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        document.body.innerHTML = ''
    })

    it('reflects the value prop in the input', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        expect(getInput(container).value).toBe('chain A')
        unmount()
    })

    it('does not commit on keystroke (draft-only)', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        await act(async () => { typeInto(getInput(container), 'chain B') })
        expect(onCommit).not.toHaveBeenCalled()
        unmount()
    })

    it('does NOT commit when focus moves to the picker trigger (sibling inside the cell)', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        await act(async () => { typeInto(input, 'chain B') })
        // Clicking the picker trigger mid-edit: input loses focus to the
        // trigger button, which lives inside the cell wrapper.
        await act(async () => { fireBlur(input, getTrigger(container)) })
        expect(onCommit).not.toHaveBeenCalled()
        unmount()
    })

    it('does NOT commit when focus moves into the picker popover (portal outside the cell)', async () => {
        const onCommit = vi.fn()
        // Simulate the popover portal: a menu item living under the picker's
        // portal class, which the cell wrapper does not contain.
        const portal = document.createElement('div')
        portal.className = 'mol-sel-list-popover'
        const item = document.createElement('a')
        portal.appendChild(item)
        document.body.appendChild(portal)
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        await act(async () => { typeInto(input, 'chain B') })
        await act(async () => { fireBlur(input, item) })
        expect(onCommit).not.toHaveBeenCalled()
        unmount()
    })

    it('commits + pushes history when focus leaves the cell entirely', async () => {
        const onCommit = vi.fn()
        const outside = document.createElement('button')
        document.body.appendChild(outside)
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        await act(async () => { typeInto(input, 'chain B') })
        await act(async () => { fireBlur(input, outside) })
        expect(onCommit).toHaveBeenCalledWith('chain B')
        expect(getHistory()).toContain('chain B')
        unmount()
        outside.remove()
    })

    it('does not commit when blur exits without a change', async () => {
        const onCommit = vi.fn()
        const outside = document.createElement('button')
        document.body.appendChild(outside)
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        await act(async () => { fireBlur(getInput(container), outside) })
        expect(onCommit).not.toHaveBeenCalled()
        unmount()
        outside.remove()
    })

    it('picking from the popover updates the draft and commits on outside blur', async () => {
        const onCommit = vi.fn()
        const outside = document.createElement('button')
        document.body.appendChild(outside)
        // Seed history so the picker has a real entry to choose.
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(['chain Z']))
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        // Open the picker, switch to History, pick the seeded entry.
        await act(async () => { getTrigger(container).click() })
        await flushPromises()
        await act(async () => { clickByText('History') })
        await flushPromises()
        await act(async () => { clickByText('chain Z') })
        await flushPromises()
        // Pick alone does not commit.
        expect(onCommit).not.toHaveBeenCalled()
        expect(getInput(container).value).toBe('chain Z')
        // Focus leaves the cell -> commit the picked value.
        await act(async () => { fireBlur(getInput(container), outside) })
        expect(onCommit).toHaveBeenCalledWith('chain Z')
        unmount()
        outside.remove()
    })

    it('Enter on the input commits (via blur)', async () => {
        const onCommit = vi.fn()
        const outside = document.createElement('button')
        document.body.appendChild(outside)
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        await act(async () => { typeInto(input, 'chain B') })
        const blurSpy = vi.spyOn(input, 'blur').mockImplementation(() => {
            // Mimic the focusout into `outside` that real blur() would trigger.
            fireBlur(input, outside)
        })
        await act(async () => {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })
        expect(blurSpy).toHaveBeenCalled()
        expect(onCommit).toHaveBeenCalledWith('chain B')
        unmount()
        outside.remove()
    })

    it('re-syncs the draft when the value prop changes (event-driven refetch)', async () => {
        const onCommit = vi.fn()
        const { container, root, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        act(() => {
            root.render(<PaintSelCell sceneID={1} value="chain B" onCommit={onCommit} />)
        })
        await flushPromises()
        expect(getInput(container).value).toBe('chain B')
        unmount()
    })

    it('does not push history for empty / "*" / "none" commits', async () => {
        const onCommit = vi.fn()
        const outside = document.createElement('button')
        document.body.appendChild(outside)
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        await act(async () => { typeInto(input, '*') })
        await act(async () => { fireBlur(input, outside) })
        expect(onCommit).toHaveBeenCalledWith('*')
        expect(getHistory()).not.toContain('*')
        unmount()
        outside.remove()
    })

    it('forwards molID to MolSelList getSelDefs', async () => {
        const onCommit = vi.fn()
        const { unmount } = mountTree(
            <PaintSelCell sceneID={7} molID={42} value="" onCommit={onCommit} />,
        )
        await flushPromises()
        expect(mockCm.invokeService).toHaveBeenCalledWith('getSelDefs', { sceneId: 7, molId: 42 })
        unmount()
    })
})
