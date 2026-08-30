/**
 * InteractionAnalysisDialog commit-wire contract (degrade-detection for T13
 * DialogShell + useMolEditCommit extraction).
 *
 * This dialog is logic-dense with zero prior component test. Pins the
 * OBSERVABLE confirm path, not the JSX:
 *   - OK calls invokeService('analyzeInteractions', { sceneId, objId, selStr,
 *     useMol2, objId2, useSel2, selStr2, minDist, maxDist, maxLabels,
 *     hbondOnly, rendName }) with the default field values built by the dialog.
 *   - On {ok:true, count} it resolves onConfirm({ ok: true, count }) -- the
 *     success result forwards the worker's label count.
 *   - On {ok:false} it shows .h3-dialog-error and does NOT resolve success.
 *   - Reset-on-open clears the error while the molecule id persists.
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

import { InteractionAnalysisDialog } from '@renderer/dialogs/InteractionAnalysisDialog'
import type { InteractionAnalysisDialogResult } from '@renderer/dialogs/InteractionAnalysisDialog'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'

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

const MOL = { uid: 5, name: 'mol1', className: 'MolCoord' }

function routeInvoke(commit: () => unknown): void {
    invokeService.mockImplementation((name: string) => {
        if (name === 'listSceneObjects') return Promise.resolve({ objects: [MOL] })
        if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [], currentSel: undefined })
        if (name === 'analyzeInteractions') return Promise.resolve(commit())
        return Promise.resolve(undefined)
    })
}

function okButton(): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'OK',
    ) as HTMLButtonElement
}

function commitCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'analyzeInteractions')
}

function mount(visible = true) {
    let captured: InteractionAnalysisDialogResult | null = null
    const handle = mountTree(
        React.createElement(InteractionAnalysisDialog, {
            visible,
            sceneId: 7,
            onConfirm: (r: InteractionAnalysisDialogResult) => { captured = r },
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

describe('InteractionAnalysisDialog commit wire', () => {
    it('OK fires analyzeInteractions with the default field payload', async () => {
        routeInvoke(() => ({ ok: true, count: 4 }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(commitCalls()[0][1]).toEqual({
            sceneId: 7,
            objId: 5,
            selStr: '',
            useMol2: false,
            objId2: undefined,
            useSel2: false,
            selStr2: '',
            minDist: 2.5,
            maxDist: 3.5,
            maxLabels: 30,
            hbondOnly: false,
            rendName: 'measure',
        })
        // Success forwards the worker's label count.
        expect(handle.captured).toEqual({ ok: true, count: 4 })
        handle.unmount()
    })

    it('on {ok:false} surfaces the error and does NOT resolve success', async () => {
        routeInvoke(() => ({ ok: false, error: 'no contacts' }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(handle.captured).toBeNull()
        expect(document.body.querySelector('.h3-dialog-error')?.textContent)
            .toBe('no contacts')
        handle.unmount()
    })

    it('reset-on-open clears the error while the molecule id persists', async () => {
        routeInvoke(() => ({ ok: false, error: 'no contacts' }))
        const handle = mount(true)
        await flushPromises()
        await act(async () => { okButton().click() })
        await flushPromises()
        expect(document.body.querySelector('.h3-dialog-error')).toBeTruthy()

        routeInvoke(() => ({ ok: true, count: 1 }))
        act(() => {
            handle.root.render(
                React.createElement(InteractionAnalysisDialog, {
                    visible: false, sceneId: 7,
                    onConfirm: () => {}, onCancel: () => {},
                }),
            )
        })
        await flushPromises()
        let captured: InteractionAnalysisDialogResult | null = null
        act(() => {
            handle.root.render(
                React.createElement(InteractionAnalysisDialog, {
                    visible: true, sceneId: 7,
                    onConfirm: (r: InteractionAnalysisDialogResult) => { captured = r },
                    onCancel: () => {},
                }),
            )
        })
        await flushPromises()
        expect(document.body.querySelector('.h3-dialog-error')).toBeNull()

        await act(async () => { okButton().click() })
        await flushPromises()
        const last = commitCalls()[commitCalls().length - 1][1] as Record<string, unknown>
        expect(last.objId).toBe(5)
        expect(captured).toEqual({ ok: true, count: 1 })
        handle.unmount()
    })
})
