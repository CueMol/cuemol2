/**
 * Tests for MolSelList -- the lightweight Named/History selection picker.
 *
 * Pins the contract that:
 *  1. getSelDefs is invoked with the supplied sceneID on mount
 *  2. selectedSel is reflected in the InputGroup (controlled, persists on blur)
 *  3. typing fires onSelectedSelChange on every keystroke
 *  4. the picker is a popover opened by the caret trigger; it carries a
 *     Named | History SegmentedControl
 *  5. the Named menu lists Selected / Scene / Global named defs
 *  6. the History tab lists getHistory() entries
 *  7. picking an item fires onSelectedSelChange and closes the popover
 *  8. validateSelection drives the input's danger intent
 *  9. selectedSel of `*` / empty does not invoke validateSelection
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
import { STORAGE_KEY } from '../h3-kit/MolSelList/selHistory'
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
    return document.querySelector('button[aria-label="Pick selection"]') as HTMLButtonElement
}

/** Open the picker popover (rendered in a portal on document.body). */
async function openPicker(): Promise<void> {
    await act(async () => { pickerTrigger().click() })
    await flushPromises()
}

/** Click a button/segment by its visible text, searched in document. */
function clickByText(text: string): void {
    const el = Array.from(document.querySelectorAll('button, .bp5-menu-item')).find(
        (b) => b.textContent?.trim() === text,
    ) as HTMLElement
    el.click()
}

function menuItemTexts(): string[] {
    return Array.from(document.querySelectorAll('.h3-mol-sel-list-popover .bp5-menu-item')).map(
        (el) => el.textContent?.trim() ?? '',
    )
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
        const input = getInput(container)
        const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value',
        )!.set!
        await act(async () => {
            nativeSetter.call(input, 'chain.A')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        expect(onChange).toHaveBeenCalledWith('chain.A')
        unmount()
    })

    it('opens a popover with a Named | History SegmentedControl', async () => {
        setupCm()
        const { unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        await openPicker()
        const popover = document.querySelector('.h3-mol-sel-list-popover')
        expect(popover).not.toBeNull()
        const btnTexts = Array.from(popover!.querySelectorAll('button')).map((b) =>
            b.textContent?.trim(),
        )
        expect(btnTexts).toEqual(expect.arrayContaining(['Named', 'History']))
        unmount()
    })

    it('Named tab lists Selected / Scene / Global named defs', async () => {
        setupCm({ selDefs: { scene: ['mySceneSel'], global: ['myGlobalSel'], currentSel: 'chain.A' } })
        const { unmount } = mountTree(
            <MolSelList sceneID={3} molID={11} selectedSel="" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        await openPicker()
        // Default tab is Named.
        expect(menuItemTexts()).toEqual(expect.arrayContaining(['chain.A', 'mySceneSel', 'myGlobalSel']))
        // Dividers carry the scope titles.
        const dividers = Array.from(
            document.querySelectorAll('.h3-mol-sel-list-popover .bp5-menu-header'),
        ).map((el) => el.textContent?.trim())
        expect(dividers).toEqual(expect.arrayContaining(['Selected', 'Scene', 'Global']))
        unmount()
    })

    it('History tab lists getHistory() entries', async () => {
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(['chain.A', 'aname CA']))
        setupCm()
        const { unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        await openPicker()
        await act(async () => { clickByText('History') })
        await flushPromises()
        expect(menuItemTexts()).toEqual(expect.arrayContaining(['chain.A', 'aname CA']))
        unmount()
    })

    it('picking a Named item fires onSelectedSelChange and closes the popover', async () => {
        const onChange = vi.fn()
        setupCm({ selDefs: { scene: ['mySceneSel'], global: [] } })
        const { unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={onChange} />,
        )
        await flushPromises()
        await openPicker()
        await act(async () => { clickByText('mySceneSel') })
        await flushPromises()
        expect(onChange).toHaveBeenCalledWith('mySceneSel')
        // Popover dismissed on pick (wait out the Blueprint close transition).
        await act(async () => { await new Promise((r) => setTimeout(r, 350)) })
        expect(document.querySelector('.h3-mol-sel-list-popover')).toBeNull()
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

    it('forwards molID to getSelDefs', async () => {
        setupCm({ selDefs: { scene: [], global: [], currentSel: 'chain.A' } })
        const { unmount } = mountTree(
            <MolSelList sceneID={3} molID={11} selectedSel="" onSelectedSelChange={() => undefined} />,
        )
        await flushPromises()
        expect(mockCm.invokeService).toHaveBeenCalledWith('getSelDefs', { sceneId: 3, molId: 11 })
        unmount()
    })
})
