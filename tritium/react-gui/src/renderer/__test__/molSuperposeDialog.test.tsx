/**
 * MolSuperposeDialog commit-wire + localStorage-history contract
 * (degrade-detection for T13 DialogShell + useMolEditCommit extraction).
 *
 * This dialog is logic-dense with zero prior component test. Pins the
 * OBSERVABLE confirm path + persistence, not the JSX:
 *   - OK calls invokeService('superposeMol', { sceneId, viewId, algo, refObjId,
 *     refSel, movObjId, movSel, useprop, autoRecenter }). Defaults: algo='LSQ',
 *     autoRecenter=true, useprop=false, sel strings empty; ref/mov default to
 *     the first/second MolCoord from listSceneObjects.
 *   - On {ok:true} it persists the molSuperposeHistory 5-field record
 *     ({refObjId, movObjId, algo, autoRecenter, useprop}) to localStorage and
 *     resolves onConfirm({ ok: true }).
 *   - On {ok:false} it shows .h3-dialog-error, does NOT resolve success, and
 *     does NOT write history.
 *   - On open the algorithm / checkbox state is restored from history.
 *
 * The default molecule ids come from the dialog's own listSceneObjects fetch
 * (ref=first uid, mov=second uid) -- pinned via two MolCoord objects.
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

import { MolSuperposeDialog } from '@renderer/dialogs/MolSuperposeDialog'
import type { MolSuperposeDialogResult } from '@renderer/dialogs/MolSuperposeDialog'
import {
    STORAGE_KEY,
    loadMolSuperposeHistory,
} from '@renderer/dialogs/molSuperposeHistory'
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

const MOLS = [
    { uid: 10, name: 'ref', className: 'MolCoord' },
    { uid: 20, name: 'mov', className: 'MolCoord' },
]

function routeInvoke(commit: () => unknown): void {
    invokeService.mockImplementation((name: string) => {
        if (name === 'listSceneObjects') return Promise.resolve({ objects: MOLS })
        if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [], currentSel: undefined })
        if (name === 'superposeMol') return Promise.resolve(commit())
        return Promise.resolve(undefined)
    })
}

function okButton(): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'OK',
    ) as HTMLButtonElement
}

function commitCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'superposeMol')
}

function mount(visible = true) {
    let captured: MolSuperposeDialogResult | null = null
    const handle = mountTree(
        React.createElement(MolSuperposeDialog, {
            visible,
            sceneId: 7,
            viewId: 3,
            onConfirm: (r: MolSuperposeDialogResult) => { captured = r },
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

describe('MolSuperposeDialog commit + history wire', () => {
    it('OK fires superposeMol with default fields and ref/mov from the list', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(commitCalls()[0][1]).toEqual({
            sceneId: 7,
            viewId: 3,
            algo: 'LSQ',
            refObjId: 10,
            refSel: '',
            movObjId: 20,
            movSel: '',
            useprop: false,
            autoRecenter: true,
        })
        expect(handle.captured).toEqual({ ok: true })
        handle.unmount()
    })

    it('on {ok:true} persists the 5-field molSuperposeHistory record', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        const raw = globalThis.localStorage.getItem(STORAGE_KEY)
        expect(raw && JSON.parse(raw)).toEqual({
            refObjId: 10,
            movObjId: 20,
            algo: 'LSQ',
            autoRecenter: true,
            useprop: false,
        })
        // And the typed loader round-trips it.
        expect(loadMolSuperposeHistory()).toEqual({
            refObjId: 10,
            movObjId: 20,
            algo: 'LSQ',
            autoRecenter: true,
            useprop: false,
        })
        handle.unmount()
    })

    it('on {ok:false} surfaces the error, does NOT resolve success, writes no history', async () => {
        routeInvoke(() => ({ ok: false, error: 'SSM failed' }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(handle.captured).toBeNull()
        expect(document.body.querySelector('.h3-dialog-error')?.textContent)
            .toBe('SSM failed')
        expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
        handle.unmount()
    })

    it('on open the algorithm is restored from saved history', async () => {
        globalThis.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ refObjId: 10, movObjId: 20, algo: 'SSM', autoRecenter: false, useprop: true }),
        )
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        // Restored algo / checkbox state flows into the commit payload.
        const payload = commitCalls()[0][1] as Record<string, unknown>
        expect(payload.algo).toBe('SSM')
        expect(payload.autoRecenter).toBe(false)
        expect(payload.useprop).toBe(true)
        handle.unmount()
    })
})
