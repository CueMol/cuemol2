/**
 * SymmetryChangeDialog commit-wire contract (degrade-detection for T13
 * DialogShell + useMolEditCommit extraction).
 *
 * This dialog is logic-dense with zero prior component test and self-fetches
 * its initial CrystalInfo. Pins the OBSERVABLE confirm path, not the JSX:
 *   - The dialog opens by fetching getSymmetryPanelInfo({sceneId,objId}) and
 *     getSpaceGroupNames({lattice}); OK is gated until both resolve.
 *   - When the cell changed vs the opened info, OK calls
 *     invokeService('changeSymmetryInfo', { sceneId, objId, a,b,c,
 *     alpha,beta,gamma, nsg }) with the edited cell, then resolves
 *     onConfirm({ ok: true }).
 *   - UNCHANGED short-circuit (UXP parity, pinned as-is): when nothing changed
 *     vs the opened info, OK resolves onConfirm({ ok: true }) WITHOUT calling
 *     changeSymmetryInfo.
 *   - On {ok:false} it surfaces the error and does NOT resolve success.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}))

const invokeService = vi.fn()
const mockCm = {
    invokeService,
    addEventListener: vi.fn().mockResolvedValue(1),
    removeEventListener: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

import { SymmetryChangeDialog } from '@renderer/dialogs/SymmetryChangeDialog'
import type { SymmetryChangeDialogResult } from '@renderer/dialogs/SymmetryChangeDialog'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'

// CrystalInfo returned on open. nsg=1 matches the first space-group entry.
const OPEN_INFO = {
    lattice: 'TRICLINIC',
    hm_spacegroup: 'P 1',
    a: 10, b: 20, c: 30, alpha: 90, beta: 90, gamma: 90, nsg: 1,
}
const SG_ITEMS = [
    { id: 1, cname: 'P 1' },
    { id: 2, cname: 'P -1' },
]

function routeInvoke(commit: () => unknown, hasInfo = true): void {
    invokeService.mockImplementation((name: string) => {
        if (name === 'getSymmetryPanelInfo') {
            return Promise.resolve({ info: OPEN_INFO, hasInfo })
        }
        if (name === 'getSpaceGroupNames') return Promise.resolve({ items: SG_ITEMS })
        if (name === 'changeSymmetryInfo') return Promise.resolve(commit())
        return Promise.resolve(undefined)
    })
}

function okButton(): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'OK',
    ) as HTMLButtonElement
}

function commitCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'changeSymmetryInfo')
}

/** First cell-dimension numeric input (the "a=" field). */
function firstCellInput(): HTMLInputElement {
    const inputs = Array.from(
        document.body.querySelectorAll('input.bp5-input'),
    ) as HTMLInputElement[]
    // The read-only Space-Group-Number field is also an input; pick the first
    // editable numeric one (the cell grid). Filter out readonly.
    const editable = inputs.filter((i) => !i.readOnly)
    return editable[0]
}

function setNumeric(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
    )!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('blur', { bubbles: true }))
}

function mount() {
    let captured: SymmetryChangeDialogResult | null = null
    const handle = mountTree(
        React.createElement(SymmetryChangeDialog, {
            visible: true,
            sceneId: 7,
            objId: 99,
            onConfirm: (r: SymmetryChangeDialogResult) => { captured = r },
            onCancel: () => {},
        }),
    )
    return { ...handle, get captured() { return captured } }
}

beforeEach(() => {
    invokeService.mockReset()
})
afterEach(() => {
    document.body.innerHTML = ''
})

describe('SymmetryChangeDialog commit wire', () => {
    it('opens by fetching getSymmetryPanelInfo + getSpaceGroupNames', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()
        const names = invokeService.mock.calls.map((c) => c[0])
        expect(names).toContain('getSymmetryPanelInfo')
        expect(names).toContain('getSpaceGroupNames')
        expect(invokeService.mock.calls.find((c) => c[0] === 'getSymmetryPanelInfo')![1])
            .toEqual({ sceneId: 7, objId: 99 })
        handle.unmount()
    })

    it('edited cell -> OK fires changeSymmetryInfo with the edited payload', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        // Change "a" from 10 to 12 so the unchanged short-circuit does not fire.
        await act(async () => { setNumeric(firstCellInput(), '12') })
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(commitCalls()[0][1]).toEqual({
            sceneId: 7,
            objId: 99,
            a: 12, b: 20, c: 30,
            alpha: 90, beta: 90, gamma: 90,
            nsg: 1,
        })
        expect(handle.captured).toEqual({ ok: true })
        handle.unmount()
    })

    it('unchanged cell -> OK short-circuits to onConfirm without a service call', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        // No edits: cell equals the opened info, so UXP-parity skip applies.
        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(0)
        expect(handle.captured).toEqual({ ok: true })
        handle.unmount()
    })

    it('on {ok:false} surfaces the error and does NOT resolve success', async () => {
        routeInvoke(() => ({ ok: false, error: 'bad symmetry' }))
        const handle = mount()
        await flushPromises()

        await act(async () => { setNumeric(firstCellInput(), '12') })
        await flushPromises()
        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(handle.captured).toBeNull()
        expect(document.body.textContent).toContain('bad symmetry')
        handle.unmount()
    })
})
