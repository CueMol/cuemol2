/**
 * Degrade-detection tests for `PaintSelCell` (Paint table's inline-edit
 * cell that wraps `MolSelList`).
 *
 * Pins the observable contract:
 *   - typing in the input updates the draft only; no commit happens
 *     until focus leaves the cell entirely
 *   - blurring into a sibling inside the cell (e.g. the picker
 *     <select>) does NOT commit -- prevents stale-draft commits when
 *     the user opens the picker mid-edit
 *   - blurring out of the cell commits and pushes the value into the
 *     shared selection history
 *   - picking from the dropdown updates the draft and commits on the
 *     subsequent outside-blur
 *   - Enter on the input commits and blurs (matches sibling inline
 *     editors); Enter on the <select> is passed through (no commit /
 *     no blur)
 *   - changing the external `value` prop re-syncs the draft (event-
 *     driven refetch from the worker)
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

import { PaintSelCell } from '../components/panes/PaintSelCell'
import { STORAGE_KEY, getHistory } from '../components/widgets/MolSelList/selHistory'
import { mountTree, flushPromises } from './helpers/testHarness'

function getInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input.bp5-input') as HTMLInputElement
}
function getSelect(container: HTMLElement): HTMLSelectElement {
    return container.querySelector('select') as HTMLSelectElement
}

function typeInto(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
    )!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype, 'value',
    )!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Fire a focusout event manually with a chosen `relatedTarget`. jsdom's
 * `.blur()` clears focus but emits a focusout whose `relatedTarget` is
 * always `null`, so to exercise the picker-blur branch we synthesise the
 * event directly.
 */
function fireBlur(target: HTMLElement, relatedTarget: HTMLElement | null): void {
    const ev = new FocusEvent('focusout', {
        bubbles: true,
        relatedTarget,
    })
    target.dispatchEvent(ev)
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

    it('does NOT render the Selection Builder trigger (Popover portal would break blur-commit)', async () => {
        const onCommit = vi.fn()
        const { unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        // Guard: PaintSelCell must mount MolSelList with the builder OFF. A
        // Popover renders in a portal outside the cell, so its open/click
        // would count as a focus-out and prematurely commit the draft.
        expect(document.querySelector('button[aria-label="Build selection"]')).toBeNull()
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

    it('does NOT commit when focus moves into the picker (sibling inside the cell)', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        const select = getSelect(container)
        await act(async () => { typeInto(input, 'chain B') })
        // Simulate clicking the picker chevron mid-edit: input loses focus,
        // the picker <select> receives it. Both live inside the cell wrapper.
        await act(async () => { fireBlur(input, select) })
        expect(onCommit).not.toHaveBeenCalled()
        unmount()
    })

    it('commits + pushes history when focus leaves the cell entirely', async () => {
        const onCommit = vi.fn()
        // An outside focus target the wrapper does NOT contain.
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
        // History should now include the committed value.
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

    it('picker change updates the draft and commits on outside blur', async () => {
        const onCommit = vi.fn()
        const outside = document.createElement('button')
        document.body.appendChild(outside)
        // Seed history so the picker has a real (non-preset) option to choose.
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(['chain Z']))
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const select = getSelect(container)
        await act(async () => { setSelectValue(select, 'chain Z') })
        await flushPromises()
        // Picker change alone does not commit (still inside the cell).
        expect(onCommit).not.toHaveBeenCalled()
        // Focus leaves the cell -> commit.
        await act(async () => { fireBlur(select, outside) })
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
        // Spy on the input's blur() so we can verify Enter dispatches it.
        const blurSpy = vi.spyOn(input, 'blur').mockImplementation(() => {
            // Manually mimic the focusout into `outside` that real blur()
            // would trigger -- otherwise jsdom would fire a null-relatedTarget
            // event that we still accept as "outside the cell".
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

    it('Enter on the <select> is passed through (no blur)', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const select = getSelect(container)
        const blurSpy = vi.spyOn(select, 'blur')
        await act(async () => {
            select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })
        expect(blurSpy).not.toHaveBeenCalled()
        expect(onCommit).not.toHaveBeenCalled()
        unmount()
    })

    it('re-syncs the draft when the value prop changes (event-driven refetch)', async () => {
        const onCommit = vi.fn()
        const { container, root, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        // Simulate a worker event arriving with a new entry value.
        act(() => {
            root.render(
                <PaintSelCell sceneID={1} value="chain B" onCommit={onCommit} />,
            )
        })
        await flushPromises()
        expect(getInput(container).value).toBe('chain B')
        unmount()
    })

    it('does not push history for empty / "*" / "none" commits', async () => {
        // pushHistory itself excludes these; verify the cell still commits
        // (so the worker clears the selection), without polluting history.
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
