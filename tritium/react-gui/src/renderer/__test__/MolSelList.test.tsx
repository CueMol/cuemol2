/**
 * Tests for MolSelList — pin the contract that:
 *  1. getSelDefs is invoked with the supplied sceneID on mount
 *  2. selectedSel is reflected in the InputGroup (controlled, persists on blur)
 *  3. typing fires onSelectedSelChange on every keystroke
 *  4. the picker (HTMLSelect) renders Preset + History + Scene + Global optgroups
 *     in that order, when their respective lists are non-empty
 *  5. the picker's selected value is a hidden empty sentinel — blank display
 *     area, no "Pick…" text
 *  6. picking an option fires onSelectedSelChange (the sentinel never does)
 *  7. validateSelection drives the input's danger intent
 *  8. selectedSel of `*` / empty does not invoke validateSelection
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

import { MolSelList } from '../components/widgets/MolSelList/MolSelList'
import { STORAGE_KEY } from '../components/widgets/MolSelList/selHistory'
import { mountTree, flushPromises } from './helpers/testHarness'

function setupCm(opts?: {
    selDefs?: { scene: string[]; global: string[] }
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

function getSelect(container: HTMLElement): HTMLSelectElement {
    return container.querySelector('select') as HTMLSelectElement
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype, 'value',
    )!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('MolSelList', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
        mockCm.invokeService.mockReset()
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('invokes getSelDefs with the supplied sceneID on mount', async () => {
        setupCm()
        const { unmount } = mountTree(
            <MolSelList sceneID={42} selectedSel="*" onSelectedSelChange={() => undefined} />
        )
        await flushPromises()
        expect(mockCm.invokeService).toHaveBeenCalledWith('getSelDefs', { sceneId: 42 })
        unmount()
    })

    it('reflects selectedSel in the input and persists on blur', async () => {
        setupCm()
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="chain.A" onSelectedSelChange={() => undefined} />
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
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={onChange} />
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

    it('uses a hidden empty-text sentinel for the picker (no "Pick…" label)', async () => {
        setupCm()
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={() => undefined} />
        )
        await flushPromises()
        const select = getSelect(container)
        // The selected option is the sentinel — first <option> child of the
        // <select> (not inside an optgroup), with hidden=true and empty text.
        const sentinel = select.querySelector(':scope > option') as HTMLOptionElement
        expect(sentinel).toBeTruthy()
        expect(sentinel.hidden).toBe(true)
        expect(sentinel.textContent).toBe('')
        // It must be the currently-selected option.
        expect(select.value).toBe(sentinel.value)
        unmount()
    })

    it('renders Preset + History + Scene + Global optgroups in order', async () => {
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(['chain.A']))
        setupCm({ selDefs: { scene: ['mySceneSel'], global: ['myGlobalSel'] } })
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={() => undefined} />
        )
        await flushPromises()
        const select = getSelect(container)
        const groups = Array.from(select.querySelectorAll('optgroup'))
        const labels = groups.map((g) => g.getAttribute('label'))
        expect(labels).toEqual(['Preset', 'History', 'Scene', 'Global'])
        unmount()
    })

    it('always includes "all (*)" and "none" presets', async () => {
        setupCm()
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={() => undefined} />
        )
        await flushPromises()
        const presetGroup = getSelect(container).querySelector('optgroup[label="Preset"]')!
        const values = Array.from(presetGroup.querySelectorAll('option')).map((o) => o.value)
        const labels = Array.from(presetGroup.querySelectorAll('option')).map((o) => o.textContent)
        expect(values).toEqual(['*', ''])
        expect(labels).toEqual(['all (*)', 'none'])
        unmount()
    })

    it('omits History / Scene / Global optgroups when their lists are empty', async () => {
        setupCm({ selDefs: { scene: [], global: [] } })
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={() => undefined} />
        )
        await flushPromises()
        const labels = Array.from(getSelect(container).querySelectorAll('optgroup')).map((g) => g.getAttribute('label'))
        expect(labels).toEqual(['Preset'])
        unmount()
    })

    it('picking an option fires onSelectedSelChange', async () => {
        const onChange = vi.fn()
        setupCm({ selDefs: { scene: ['mySceneSel'], global: [] } })
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="" onSelectedSelChange={onChange} />
        )
        await flushPromises()
        const select = getSelect(container)
        await act(async () => { setSelectValue(select, 'mySceneSel') })
        await flushPromises()
        expect(onChange).toHaveBeenCalledWith('mySceneSel')
        unmount()
    })

    it('marks input intent=danger when validateSelection returns ok:false', async () => {
        setupCm({ validateOk: false })
        const { container, unmount } = mountTree(
            <MolSelList sceneID={1} selectedSel="bogus" onSelectedSelChange={() => undefined} />
        )
        await act(async () => { vi.advanceTimersByTime(300) })
        await flushPromises()
        const input = getInput(container)
        expect(input.getAttribute('aria-invalid')).toBe('true')
        const wrapper = input.closest('.bp5-input-group')
        expect(wrapper?.classList.contains('bp5-intent-danger')).toBe(true)
        unmount()
    })

    it('does not invoke validateSelection for empty / "*" values', async () => {
        setupCm({ validateOk: false })
        mountTree(
            <MolSelList sceneID={1} selectedSel="*" onSelectedSelChange={() => undefined} />
        )
        await act(async () => { vi.advanceTimersByTime(300) })
        await flushPromises()
        const validateCalls = mockCm.invokeService.mock.calls.filter((c: any[]) => c[0] === 'validateSelection')
        expect(validateCalls.length).toBe(0)
    })
})
