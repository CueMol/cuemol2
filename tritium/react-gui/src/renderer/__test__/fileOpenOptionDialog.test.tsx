/**
 * Pin UXP-parity behaviors for FileOpenOptionDialog (renderer options):
 *   1. Renderer name auto-updates on renderer-type change while flag=true.
 *   2. Once the user edits renderer name, type change does NOT overwrite it.
 *   3. Clearing the renderer name re-arms the auto-update.
 *   4. Initial renderer type is restored from per-objType localStorage history.
 *   5. History value not present in rendererTypes falls back to rendererTypes[0].
 *   6. Open (confirm) writes the chosen renderer type back to history.
 *   7. Initial object-name fetch uses { kind: 'object', tryBare: true, suffix: 'parens' }.
 *   8. Stale proposeUniqName response (older type-change) is discarded by request-seq guard.
 *
 * All against the pdb file path so isMolFormat=true exercises the same code
 * path as the real OpenObjByPath flow. MolSelList children are isolated via
 * the cm mock returning empty for getSelDefs/validateSelection.
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

const mockCm = {
    proposeUniqName: vi.fn(),
    invokeService: vi.fn(),
}

vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

import { FileOpenOptionDialog } from '../components/fopen-opt-dlgs/FileOpenOptionDialog'
import {
    STORAGE_KEY,
    getDefaultRendType,
    setDefaultRendType,
} from '../components/fopen-opt-dlgs/rendTypeHistory'
import type { FileOpenOptions } from '../components/fopen-opt-dlgs/types'
import { mountTree, flushPromises } from './helpers/testHarness'

function findByText(root: ParentNode, tag: string, text: string): HTMLElement | null {
    const els = Array.from(root.querySelectorAll(tag)) as HTMLElement[]
    return els.find((b) => (b.textContent ?? '').trim() === text) ?? null
}

function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
    )!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype, 'value',
    )!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
}

function getById<T extends HTMLElement>(id: string): T {
    const el = document.body.querySelector('#' + id) as T | null
    if (!el) throw new Error(`#${id} not found in mounted tree`)
    return el
}

function mount(props: Partial<React.ComponentProps<typeof FileOpenOptionDialog>> = {}) {
    let captured: FileOpenOptions | null = null
    let canceled = false
    const handle = mountTree(
        React.createElement(FileOpenOptionDialog, {
            visible: true,
            filePath: '/path/1mbn.pdb',
            sceneId: 7,
            rendererTypes: ['simple', 'ribbon', 'cartoon'],
            objType: 'MolCoord',
            onConfirm: (o: FileOpenOptions) => { captured = o },
            onCancel: () => { canceled = true },
            ...props,
        }),
    )
    return {
        ...handle,
        get captured() { return captured },
        get canceled() { return canceled },
    }
}

describe('FileOpenOptionDialog (UXP parity)', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
        mockCm.proposeUniqName.mockReset()
        mockCm.invokeService.mockReset()
        mockCm.invokeService.mockImplementation((name: string) => {
            if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [] })
            if (name === 'validateSelection') return Promise.resolve({ ok: true })
            return Promise.resolve(null)
        })
        // Default: return { name: prefix + (suffix style applied) } based on args
        mockCm.proposeUniqName.mockImplementation((args: any) => {
            if (args.kind === 'sceneRenderer') {
                return Promise.resolve({ name: args.prefix + '1' })
            }
            if (args.kind === 'object') {
                return Promise.resolve({ name: args.tryBare ? args.prefix : args.prefix + '1' })
            }
            return Promise.resolve({ name: args.prefix + '1' })
        })
    })

    afterEach(() => {
        // No timers to restore here.
    })

    it('on mount: requests scene-wide unique renderer name for the default type', async () => {
        const handle = mount()
        await flushPromises()
        const sceneRendCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'sceneRenderer',
        )
        expect(sceneRendCalls.length).toBeGreaterThanOrEqual(1)
        expect(sceneRendCalls[0][0]).toMatchObject({
            kind: 'sceneRenderer',
            prefix: 'simple',
            sceneId: 7,
        })
        const rendNameInput = getById<HTMLInputElement>('rend-name')
        expect(rendNameInput.value).toBe('simple1')
        handle.unmount()
    })

    it('on mount: requests unique object name with tryBare + suffix:parens', async () => {
        const handle = mount()
        await flushPromises()
        const objCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'object',
        )
        expect(objCalls.length).toBeGreaterThanOrEqual(1)
        expect(objCalls[0][0]).toMatchObject({
            kind: 'object',
            prefix: '1mbn',
            sceneId: 7,
            tryBare: true,
            suffix: 'parens',
        })
        const objNameInput = getById<HTMLInputElement>('rend-objname')
        expect(objNameInput.value).toBe('1mbn')
        handle.unmount()
    })

    it('renderer name auto-updates on type change while flag=true', async () => {
        const handle = mount()
        await flushPromises()
        mockCm.proposeUniqName.mockClear()

        const select = getById<HTMLSelectElement>('rend-type')
        await act(async () => { setSelectValue(select, 'ribbon') })
        await flushPromises()

        const sceneRendCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'sceneRenderer',
        )
        expect(sceneRendCalls.length).toBeGreaterThanOrEqual(1)
        expect(sceneRendCalls[sceneRendCalls.length - 1][0]).toMatchObject({
            kind: 'sceneRenderer', prefix: 'ribbon', sceneId: 7,
        })
        const rendNameInput = getById<HTMLInputElement>('rend-name')
        expect(rendNameInput.value).toBe('ribbon1')
        handle.unmount()
    })

    it('renderer name does NOT auto-update on type change after user edits it', async () => {
        const handle = mount()
        await flushPromises()

        const rendNameInput = getById<HTMLInputElement>('rend-name')
        await act(async () => { setInputValue(rendNameInput, 'myrend') })
        await flushPromises()
        expect(rendNameInput.value).toBe('myrend')

        mockCm.proposeUniqName.mockClear()
        const select = getById<HTMLSelectElement>('rend-type')
        await act(async () => { setSelectValue(select, 'ribbon') })
        await flushPromises()

        const sceneRendCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'sceneRenderer',
        )
        expect(sceneRendCalls.length).toBe(0)
        expect(rendNameInput.value).toBe('myrend')
        handle.unmount()
    })

    it('clearing the renderer name re-arms auto-update on next type change', async () => {
        const handle = mount()
        await flushPromises()

        const rendNameInput = getById<HTMLInputElement>('rend-name')
        // user types
        await act(async () => { setInputValue(rendNameInput, 'myrend') })
        await flushPromises()
        // user clears
        await act(async () => { setInputValue(rendNameInput, '') })
        await flushPromises()

        mockCm.proposeUniqName.mockClear()
        const select = getById<HTMLSelectElement>('rend-type')
        await act(async () => { setSelectValue(select, 'cartoon') })
        await flushPromises()

        const sceneRendCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'sceneRenderer',
        )
        expect(sceneRendCalls.length).toBeGreaterThanOrEqual(1)
        expect(rendNameInput.value).toBe('cartoon1')
        handle.unmount()
    })

    // Regression: emptying the field mid-edit must NOT trigger a re-fetch.
    // UXP's XUL <textbox> only fires "change" on commit, so users never see
    // an in-progress empty state replaced. React onChange fires per keystroke,
    // so the auto-fill effect must not depend on the "is default" flag —
    // otherwise the field gets reset while the user is mid-edit.
    it('clearing the renderer name does NOT trigger immediate auto-fill', async () => {
        const handle = mount()
        await flushPromises()

        const rendNameInput = getById<HTMLInputElement>('rend-name')
        expect(rendNameInput.value).toBe('simple1')

        // Ignore the initial mount fetches.
        mockCm.proposeUniqName.mockClear()

        // User clears the field (e.g. Ctrl-A, Delete) — purely a mid-edit
        // step before typing a custom name.
        await act(async () => { setInputValue(rendNameInput, '') })
        await flushPromises()

        // Critically: no sceneRenderer fetch should fire from the empty
        // transition alone. The field must stay empty so the user can type.
        const sceneRendCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'sceneRenderer',
        )
        expect(sceneRendCalls.length).toBe(0)
        expect(rendNameInput.value).toBe('')

        handle.unmount()
    })

    // Regression companion: typing partial characters must not trigger
    // any auto-fill either, even if the field briefly contains values
    // that look unusual.
    it('typing into the renderer name does NOT trigger sceneRenderer fetches', async () => {
        const handle = mount()
        await flushPromises()

        const rendNameInput = getById<HTMLInputElement>('rend-name')
        mockCm.proposeUniqName.mockClear()

        // Simulate three keystrokes: 'a', 'ab', 'abc'.
        await act(async () => { setInputValue(rendNameInput, 'a') })
        await act(async () => { setInputValue(rendNameInput, 'ab') })
        await act(async () => { setInputValue(rendNameInput, 'abc') })
        await flushPromises()

        const sceneRendCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'sceneRenderer',
        )
        expect(sceneRendCalls.length).toBe(0)
        expect(rendNameInput.value).toBe('abc')

        handle.unmount()
    })

    it('initial rendererType comes from history when the value is in rendererTypes', async () => {
        setDefaultRendType('MolCoord', 'ribbon')
        const handle = mount()
        await flushPromises()
        const select = getById<HTMLSelectElement>('rend-type')
        expect(select.value).toBe('ribbon')
        const sceneRendCalls = mockCm.proposeUniqName.mock.calls.filter(
            (c) => c[0].kind === 'sceneRenderer',
        )
        expect(sceneRendCalls[0][0]).toMatchObject({
            kind: 'sceneRenderer', prefix: 'ribbon',
        })
        handle.unmount()
    })

    it('falls back to rendererTypes[0] when history value is not in rendererTypes', async () => {
        setDefaultRendType('MolCoord', 'spaghetti')
        const handle = mount()
        await flushPromises()
        const select = getById<HTMLSelectElement>('rend-type')
        expect(select.value).toBe('simple')
        handle.unmount()
    })

    it('Open writes the selected rendererType to history (per objType)', async () => {
        const handle = mount()
        await flushPromises()

        const select = getById<HTMLSelectElement>('rend-type')
        await act(async () => { setSelectValue(select, 'ribbon') })
        await flushPromises()

        const openBtn = findByText(document.body, 'button', 'Open') as HTMLButtonElement
        expect(openBtn).toBeTruthy()
        await act(async () => { openBtn.click() })
        await flushPromises()

        expect(getDefaultRendType('MolCoord')).toBe('ribbon')
        const raw = globalThis.localStorage.getItem(STORAGE_KEY)
        expect(raw && JSON.parse(raw)).toEqual({ MolCoord: 'ribbon' })
        handle.unmount()
    })

    it('Open with empty objType does not write history (no-op set)', async () => {
        const handle = mount({ objType: '' })
        await flushPromises()
        const openBtn = findByText(document.body, 'button', 'Open') as HTMLButtonElement
        await act(async () => { openBtn.click() })
        await flushPromises()
        expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
        handle.unmount()
    })

    it('discards stale proposeUniqName responses (older type-change wins by seq)', async () => {
        // Manual-controlled promise resolvers per call so we can decide the order.
        const resolvers: Array<(v: { name: string }) => void> = []
        mockCm.proposeUniqName.mockImplementation((args: any) => {
            return new Promise((resolve) => {
                if (args.kind === 'sceneRenderer') {
                    resolvers.push(resolve as (v: { name: string }) => void)
                } else {
                    // Resolve object-name probe immediately so it doesn't interfere.
                    resolve({ name: args.tryBare ? args.prefix : args.prefix + '1' })
                }
            })
        })

        const handle = mount()
        // Don't flush yet — initial sceneRenderer probe is pending.
        // Switch type A → B without resolving A first.
        const select = getById<HTMLSelectElement>('rend-type')
        await act(async () => { setSelectValue(select, 'ribbon') })
        await act(async () => { setSelectValue(select, 'cartoon') })

        // Resolve oldest first (stale), then newest.
        // resolvers may have entries for initial 'simple', then 'ribbon', then 'cartoon'.
        // Resolve in reverse to make the "stale wins" path impossible.
        expect(resolvers.length).toBeGreaterThanOrEqual(2)
        // Resolve the second-to-last (older) AFTER the last with stale value.
        // The dialog should keep the value from the LATEST request.
        await act(async () => {
            // Resolve newest last.
            for (let i = 0; i < resolvers.length - 1; ++i) {
                resolvers[i]({ name: 'STALE_' + i })
            }
            resolvers[resolvers.length - 1]({ name: 'cartoon1' })
        })
        await flushPromises()

        const rendNameInput = getById<HTMLInputElement>('rend-name')
        expect(rendNameInput.value).toBe('cartoon1')
        handle.unmount()
    })
})
