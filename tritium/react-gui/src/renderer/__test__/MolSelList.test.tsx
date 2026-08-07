/**
 * Tests for MolSelList -- the selection picker whose chevron popover holds the
 * shared tabbed `SelectionBuilder` (Named / History / Term / Mod).
 *
 * Pins the contract that:
 *  1. getSelDefs is invoked with the supplied sceneID (and molID) on mount
 *  2. selectedSel is reflected in the InputGroup (controlled, persists on blur)
 *  3. typing fires onSelectedSelChange on every keystroke
 *  4. the caret opens a popover holding the tabbed builder
 *  5. a Term-tab op composes into selectedSel via onSelectedSelChange WITHOUT
 *     committing (onCommit stays on blur) and does NOT write mol.sel
 *  6. validateSelection drives the input's danger intent
 *  7. selectedSel of `*` / empty does not invoke validateSelection
 *  8. a Named-tab pick commits the NEW expression exactly once and closes the
 *     popover (regression guard: the close path used to re-commit the stale
 *     `selectedSel` prop, overwriting the pick with the pre-click value)
 *  9. getSelDefs.currentSel surfaces in the Named tab as "Selected"
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

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { MolSelList } from '../h3-kit/MolSelList/MolSelList'
import { mountTree, flushPromises } from './helpers/testHarness'

function setupCm(opts?: {
    selDefs?: { scene: string[]; global: string[]; currentSel?: string }
    validateOk?: boolean
}) {
    mockCm.invokeService.mockImplementation((name: string) => {
        if (name === 'getSelDefs') {
            return Promise.resolve(opts?.selDefs ?? { scene: [], global: [] })
        }
        if (name === 'validateSelection') {
            return Promise.resolve({ ok: opts?.validateOk ?? true })
        }
        return Promise.resolve(null)
    })
}

function getInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input.bp5-input') as HTMLInputElement
}

function pickerTrigger(): HTMLButtonElement {
    return document.querySelector('button[aria-label="Build selection"]') as HTMLButtonElement
}

/** Open the picker popover (rendered in a portal on document.body). */
async function openPicker(): Promise<void> {
    await act(async () => { pickerTrigger().click() })
    await flushPromises()
}

function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

/** Click a builder op button by its label span (ignoring the hit-count badge,
 *  which may read "..." while loading). */
function clickOp(label: string): void {
    const el = Array.from(document.querySelectorAll('button')).find(
        (b) => b.querySelector('.selbuilder-op-label')?.textContent?.trim() === label,
    ) as HTMLElement
    el.click()
}

/** Switch the (portaled) popover to a tab by its label. */
function selectTab(label: string): void {
    const btn = Array.from(document.querySelectorAll('.h3-form-segmented button')).find(
        (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement
    btn.click()
}

/** Find a Named / History tab menu item by its text. */
function quickItem(text: string): HTMLElement | undefined {
    return Array.from(document.querySelectorAll('.selbuilder-menu .bp5-menu-item')).find(
        (el) => el.textContent?.trim() === text,
    ) as HTMLElement | undefined
}

describe('MolSelList', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
        mockCm.invokeService.mockReset()
        // Real timers: the popover open path and validation debounce both
        // settle via flushPromises; fake timers complicate portal mounting.
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('invokes getSelDefs with the supplied sceneID on mount', async () => {
        setupCm()
        const { unmount } = mountTree(
            <MolSelList sceneID={42} selectedSel="*" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        expect(mockCm.invokeService).toHaveBeenCalledWith('getSelDefs', { sceneId: 42 })
        unmount()
    })

    it('forwards molID to getSelDefs', async () => {
        setupCm()
        const { unmount } = mountTree(
            <MolSelList sceneID={3} molID={11} selectedSel="" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        expect(mockCm.invokeService).toHaveBeenCalledWith('getSelDefs', { sceneId: 3, molId: 11 })
        unmount()
    })

    it('reflects selectedSel in the input and persists on blur', async () => {
        setupCm()
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="chain.A" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        const input = getInput(container)
        expect(input.value).toBe('chain.A')
        await act(async () => { input.blur() })
        await flushPromises()
        expect(input.value).toBe('chain.A')
        unmount()
    })

    it('fires onSelectedSelChange on each keystroke', async () => {
        setupCm()
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={onChange} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getInput(container), 'chain.A') })
        expect(onChange).toHaveBeenCalledWith('chain.A')
        unmount()
    })

    it('opens a popover holding the tabbed builder', async () => {
        setupCm()
        const { unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        await openPicker()
        const popover = document.querySelector('.h3-mol-sel-list-popover')
        expect(popover).not.toBeNull()
        const tabs = Array.from(popover!.querySelectorAll('.h3-form-segmented button')).map((b) =>
            b.textContent?.trim(),
        )
        expect(tabs).toEqual(['Named', 'History', 'Term', 'Mod'])
        unmount()
    })

    it('a builder op composes into selectedSel without committing or writing mol.sel', async () => {
        setupCm()
        const onChange = vi.fn()
        const onCommit = vi.fn()
        const { unmount } = mountTree(
            <MolSelList
                sceneID={1}
                molID={11}
                selectedSel=""
                onSelectedSelChange={onChange}
                onCommit={onCommit}
            />,
        )
        await flushPromises()
        await openPicker()
        // Pick the `chain` keyword on the Term tab, type a value, press Set.
        await act(async () => { selectTab('Term') })
        await act(async () => {
            setNativeValue(document.querySelector('.selbuilder-property select') as HTMLSelectElement, 'chain')
        })
        await act(async () => {
            setNativeValue(document.querySelector('.selbuilder-term-form input.bp5-input') as HTMLInputElement, 'A')
        })
        await act(async () => { clickOp('Set') })
        await flushPromises()
        // The composed expression flows to the value...
        expect(onChange).toHaveBeenCalledWith("chain 'A'")
        // ...but the builder never commits (that is blur's job) nor mutates the
        // molecule's actual selection.
        expect(onCommit).not.toHaveBeenCalled()
        const wroteSel = mockCm.invokeService.mock.calls.some(
            (c: unknown[]) => c[0] === 'applyMolSelString' || c[0] === 'centerMolSelection',
        )
        expect(wroteSel).toBe(false)
        unmount()
    })

    it('keeps the popover open when a nested combobox dropdown item is picked', async () => {
        setupCm()
        const onCommit = vi.fn()
        const { unmount } = mountTree(
            <MolSelList sceneID={1} molID={11} selectedSel="" onSelectedSelChange={() => undefined} onCommit={onCommit} />,
        )
        await flushPromises()
        await openPicker()
        // A pick in the keyword-autocomplete dropdown is portaled OUTSIDE the
        // popover; simulate its mousedown target (a `.h3-form-combobox-menu`
        // item) reaching Blueprint's outside-click handler.
        const menu = document.createElement('div')
        menu.className = 'h3-form-combobox-menu'
        const item = document.createElement('a')
        menu.appendChild(item)
        document.body.appendChild(menu)
        await act(async () => { item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
        await flushPromises()
        // The popover stays open and nothing is committed.
        expect(document.querySelector('.h3-mol-sel-list-popover')).not.toBeNull()
        expect(onCommit).not.toHaveBeenCalled()
        menu.remove()
        unmount()
    })

    it('marks input intent=danger when validateSelection returns ok:false', async () => {
        setupCm({ validateOk: false })
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="bogus" onSelectedSelChange={() => undefined} />,
        )
        // Validation is debounced 500ms; wait it out with real timers.
        await new Promise((r) => setTimeout(r, 600))
        await flushPromises()
        const input = getInput(container)
        expect(input.getAttribute('aria-invalid')).toBe('true')
        const wrapper = input.closest('.bp5-input-group')
        expect(wrapper?.classList.contains('bp5-intent-danger')).toBe(true)
        unmount()
    })

    it('does not invoke validateSelection for empty / "*" values', async () => {
        setupCm({ validateOk: false })
        const { unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="*" onSelectedSelChange={() => undefined} />,
        )
        await new Promise((r) => setTimeout(r, 600))
        await flushPromises()
        const validateCalls = mockCm.invokeService.mock.calls.filter((c: unknown[]) => c[0] === 'validateSelection')
        expect(validateCalls.length).toBe(0)
        unmount()
    })

    it('a Named-tab pick commits the new expression once and closes the popover', async () => {
        setupCm({ selDefs: { scene: [], global: ['protein'] } })
        const onChange = vi.fn()
        const onCommit = vi.fn()
        const { unmount } = mountTree(
            <MolSelList
                sceneID={1}
                molID={11}
                selectedSel="chain.A"
                onSelectedSelChange={onChange}
                onCommit={onCommit}
            />,
        )
        await flushPromises()
        await openPicker()
        await act(async () => { quickItem('protein')!.click() })
        await flushPromises()
        // Exactly one commit, carrying the NEW expression: the `selectedSel`
        // prop is still the stale pre-click value in this tick, so a commit
        // routed through the popover-close path would write "chain.A" back.
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith('protein')
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith('protein')
        // The popover closes (Blueprint removes it after its exit transition).
        await new Promise((r) => setTimeout(r, 400))
        await flushPromises()
        expect(document.querySelector('.h3-mol-sel-list-popover')).toBeNull()
        unmount()
    })

    it('surfaces getSelDefs.currentSel in the Named tab', async () => {
        setupCm({ selDefs: { scene: [], global: [], currentSel: 'resid 10:20' } })
        const { unmount } = mountTree(
            <MolSelList sceneID={1} molID={11} selectedSel="" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        await openPicker()
        expect(quickItem('resid 10:20')).toBeTruthy()
        unmount()
    })
})
