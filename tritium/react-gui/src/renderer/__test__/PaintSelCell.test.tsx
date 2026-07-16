/**
 * Degrade-detection tests for `PaintSelCell` (Paint table's inline-edit
 * cell that wraps `MolSelList`).
 *
 * Pins the observable commit contract:
 *   - typing in the input updates the draft only; no commit until blur
 *   - blurring the input commits the changed value and pushes it to history
 *   - blurring without a change does not commit
 *   - composing in the builder popover commits on popover close (the finalize
 *     step; regression guard: an earlier version swallowed popover picks, so
 *     the scene kept the old selection)
 *   - "*" / empty / "none" commits are not pushed to the shared history
 *   - changing the external `value` prop re-syncs the draft (event-driven
 *     refetch)
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
import { getHistory } from '../h3-kit/MolSelList/selHistory'
import { mountTree, flushPromises } from './helpers/testHarness'

function getInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input.bp5-input') as HTMLInputElement
}
function getTrigger(container: HTMLElement): HTMLButtonElement {
    return container.querySelector('button[aria-label="Build selection"]') as HTMLButtonElement
}

function typeInto(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
    )!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelect(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
}

/** React maps onBlur to the delegated focusout event. */
function blur(input: HTMLInputElement): void {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
}

/** Click a builder op button by its label span (ignoring the hit-count badge). */
function clickOp(label: string): void {
    const el = Array.from(document.querySelectorAll('button')).find(
        (b) => b.querySelector('.selbuilder-op-label')?.textContent?.trim() === label,
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

    it('commits + pushes history when the input blurs with a change', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        await act(async () => { typeInto(input, 'chain B') })
        await act(async () => { blur(input) })
        expect(onCommit).toHaveBeenCalledWith('chain B')
        expect(getHistory()).toContain('chain B')
        unmount()
    })

    it('does not commit when the input blurs without a change', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        await act(async () => { blur(getInput(container)) })
        expect(onCommit).not.toHaveBeenCalled()
        unmount()
    })

    it('composing in the popover commits on close (no input blur required)', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        // Open the builder popover and compose `chain 'Z'` via Set.
        await act(async () => { getTrigger(container).click() })
        await flushPromises()
        await act(async () => {
            setSelect(document.querySelector('.selbuilder-property select') as HTMLSelectElement, 'chain')
        })
        await act(async () => {
            typeInto(document.querySelector('.selbuilder-term-form input.bp5-input') as HTMLInputElement, 'Z')
        })
        await act(async () => { clickOp('Set') })
        await flushPromises()
        // Composing updates the draft (input reflects it) but has not committed.
        expect(getInput(container).value).toBe("chain 'Z'")
        expect(onCommit).not.toHaveBeenCalled()
        // Closing the popover (outside click) finalises -> commit (the analogue
        // of the old pick commit); no input blur needed.
        await act(async () => {
            document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        })
        await flushPromises()
        expect(onCommit).toHaveBeenCalledWith("chain 'Z'")
        expect(getInput(container).value).toBe("chain 'Z'")
        unmount()
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

    it('does not push history for "*" commits (but still commits)', async () => {
        const onCommit = vi.fn()
        const { container, unmount } = mountTree(
            <PaintSelCell sceneID={1} value="chain A" onCommit={onCommit} />,
        )
        await flushPromises()
        const input = getInput(container)
        await act(async () => { typeInto(input, '*') })
        await act(async () => { blur(input) })
        expect(onCommit).toHaveBeenCalledWith('*')
        expect(getHistory()).not.toContain('*')
        unmount()
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
