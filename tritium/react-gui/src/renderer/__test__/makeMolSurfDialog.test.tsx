/**
 * MakeMolSurfDialog commit-wire contract (degrade-detection for T13
 * DialogShell + useMolEditCommit extraction).
 *
 * Pins the OBSERVABLE confirm path, not the JSX:
 *   - OK calls invokeService('makeMolSurf', { sceneId, objId, selStr, surfName,
 *     density, probeRadius }). With "Use selection" off (default) selStr is the
 *     empty string -- pinned as-is.
 *   - The surface name is prefilled via proposeMolSurfName when the molecule
 *     resolves, and that prefilled value flows into the commit payload.
 *   - On {ok:true} it resolves onConfirm({ ok: true }); on {ok:false} it shows
 *     .h3-dialog-error and does NOT resolve success.
 *   - Reset-on-open clears the error (transient state) while the molecule id
 *     persists.
 *
 * objId is populated by the embedded ObjectSelect auto-selecting the first
 * MolCoord once listSceneObjects resolves.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('../contexts/ThemeContext', () => ({
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

import { MakeMolSurfDialog } from '../components/dialogs/MakeMolSurfDialog'
import type { MakeMolSurfDialogResult } from '../components/dialogs/MakeMolSurfDialog'
import { mountTree, flushPromises } from './helpers/testHarness'

// jsdom in this runner does not expose globalThis.localStorage; install a
// minimal in-memory shim so the selection-history side-effect path is testable.
function installLocalStorage(): void {
    const store = new Map<string, string>()
    ;(globalThis as any).localStorage = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, String(v)) },
        removeItem: (k: string) => { store.delete(k) },
        clear: () => { store.clear() },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size },
    }
}

const MOL = { uid: 11, name: 'mol1', className: 'MolCoord' }

function routeInvoke(commit: () => unknown): void {
    invokeService.mockImplementation((name: string) => {
        if (name === 'listSceneObjects') return Promise.resolve({ objects: [MOL] })
        if (name === 'proposeMolSurfName') return Promise.resolve({ name: 'sf_mol1' })
        if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [], currentSel: undefined })
        if (name === 'makeMolSurf') return Promise.resolve(commit())
        return Promise.resolve(undefined)
    })
}

function okButton(): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'OK',
    ) as HTMLButtonElement
}

function commitCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'makeMolSurf')
}

function mount(visible = true) {
    let captured: MakeMolSurfDialogResult | null = null
    const handle = mountTree(
        React.createElement(MakeMolSurfDialog, {
            visible,
            sceneId: 7,
            onConfirm: (r: MakeMolSurfDialogResult) => { captured = r },
            onCancel: () => {},
        }),
    )
    return { ...handle, get captured() { return captured } }
}

beforeEach(() => {
    installLocalStorage()
    globalThis.localStorage.clear()
    invokeService.mockReset()
})
afterEach(() => {
    document.body.innerHTML = ''
})

describe('MakeMolSurfDialog commit wire', () => {
    it('OK fires makeMolSurf with the prefilled name + default fields', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(commitCalls()[0][1]).toEqual({
            sceneId: 7,
            objId: 11,
            selStr: '',
            surfName: 'sf_mol1',
            density: 1,
            probeRadius: 1.4,
            backend: 'auto',
        })
        expect(handle.captured).toEqual({ ok: true })
        handle.unmount()
    })

    it('on {ok:false} surfaces the error and does NOT resolve success', async () => {
        routeInvoke(() => ({ ok: false, error: 'surf failed' }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(handle.captured).toBeNull()
        expect(document.body.querySelector('.h3-dialog-error')?.textContent)
            .toBe('surf failed')
        handle.unmount()
    })

    it('default-path OK writes no selection history', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()
        await act(async () => { okButton().click() })
        await flushPromises()
        // selStr === '' on the default path, so pushHistory is not called.
        expect(globalThis.localStorage.getItem('cuemol.molSelList.history')).toBeNull()
        handle.unmount()
    })

    /** The density SliderField row, found by its label (the probe-radius
     *  NumericField lives in the same dialog, so queries must be scoped). */
    function densityRow(): HTMLElement {
        const row = Array.from(
            document.body.querySelectorAll('.h3-form-sliderfield-row'),
        ).find(
            (r) =>
                r.querySelector('.h3-form-sliderfield-label')?.textContent ===
                'Point density (/A)',
        )
        if (!row) throw new Error('density slider row not found')
        return row as HTMLElement
    }

    it('density is a slider+stepper field; stepping up updates the commit payload', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        const up = densityRow().querySelector('[aria-label="Increment"]') as HTMLButtonElement
        expect(up).toBeTruthy()
        await act(async () => { up.click() })
        await act(async () => { up.click() })

        await act(async () => { okButton().click() })
        await flushPromises()

        // Default 1 stepped up twice.
        expect((commitCalls()[0][1] as Record<string, unknown>).density).toBe(3)
        handle.unmount()
    })

    it('a typed density commits on blur and is clamped into 1-10', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        const input = densityRow().querySelector('.h3-form-sliderfield-number') as HTMLInputElement
        expect(input).toBeTruthy()
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value',
        )?.set
        act(() => {
            setter?.call(input, '15')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        act(() => {
            input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        })

        await act(async () => { okButton().click() })
        await flushPromises()

        expect((commitCalls()[0][1] as Record<string, unknown>).density).toBe(10)
        handle.unmount()
    })

    it('reset-on-open clears the error while the molecule id persists', async () => {
        routeInvoke(() => ({ ok: false, error: 'surf failed' }))
        const handle = mount(true)
        await flushPromises()
        await act(async () => { okButton().click() })
        await flushPromises()
        expect(document.body.querySelector('.h3-dialog-error')).toBeTruthy()

        routeInvoke(() => ({ ok: true }))
        act(() => {
            handle.root.render(
                React.createElement(MakeMolSurfDialog, {
                    visible: false, sceneId: 7,
                    onConfirm: () => {}, onCancel: () => {},
                }),
            )
        })
        await flushPromises()
        let captured: MakeMolSurfDialogResult | null = null
        act(() => {
            handle.root.render(
                React.createElement(MakeMolSurfDialog, {
                    visible: true, sceneId: 7,
                    onConfirm: (r: MakeMolSurfDialogResult) => { captured = r },
                    onCancel: () => {},
                }),
            )
        })
        await flushPromises()
        expect(document.body.querySelector('.h3-dialog-error')).toBeNull()

        await act(async () => { okButton().click() })
        await flushPromises()
        const last = commitCalls()[commitCalls().length - 1][1] as Record<string, unknown>
        expect(last.objId).toBe(11)
        expect(captured).toEqual({ ok: true })
        handle.unmount()
    })
})
