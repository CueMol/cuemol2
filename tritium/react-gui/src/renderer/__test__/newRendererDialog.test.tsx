/**
 * Pins that the "New Renderer" (Renderer Add) path gets the same UXP-parity
 * renderer-options behaviour the file-open path has, now that both share
 * the `useRendererOptions` hook:
 *
 *   1. Initial renderer type is restored from per-objClassName history.
 *   2. Renderer name follows the selected type while it is still default.
 *   3. Once the user edits the name, a type change does NOT overwrite it.
 *   4. Create writes the chosen renderer type back to history.
 *
 * `isMol: false` keeps MolSelList out of the tree so the test isolates the
 * renderer type / name wiring.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}))

const mockCm = {
    invokeService: vi.fn(),
}

/**
 * `proposeUniqName` args recorded via `invokeService` (after the apis/*
 * facade collapse the dialog calls `cm.invokeService('proposeUniqName',
 * args)`). Returns the args object for each call.
 */
function proposeArgs(): any[] {
    return mockCm.invokeService.mock.calls
        .filter((c) => c[0] === 'proposeUniqName')
        .map((c) => c[1])
}

vi.mock('../hooks/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

import { NewRendererDialog } from '../components/dialogs/NewRendererDialog'
import type { NewRendererDialogResult } from '../components/dialogs/NewRendererDialog'
import {
    STORAGE_KEY,
    getDefaultRendType,
    setDefaultRendType,
} from '../components/fopen-opt-dlgs/rendTypeHistory'
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

function mount(props: Partial<React.ComponentProps<typeof NewRendererDialog>> = {}) {
    let captured: NewRendererDialogResult | null = null
    const handle = mountTree(
        React.createElement(NewRendererDialog, {
            visible: true,
            objName: 'obj1',
            objClassName: 'MolCoord',
            rendererTypes: ['simple', 'ribbon', 'cartoon'],
            defaultName: 'simple1',
            sceneId: 7,
            isMol: false,
            onConfirm: (r: NewRendererDialogResult) => { captured = r },
            onCancel: () => {},
            ...props,
        }),
    )
    return { ...handle, get captured() { return captured } }
}

describe('NewRendererDialog (renderer-add parity)', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
        mockCm.invokeService.mockReset()
        mockCm.invokeService.mockImplementation((name: string, args: { prefix: string }) =>
            name === 'proposeUniqName'
                ? Promise.resolve({ name: args.prefix + '1' })
                : Promise.resolve(null),
        )
    })

    it('initial renderer type is rendererTypes[0] without history', async () => {
        const handle = mount()
        await flushPromises()
        expect(getById<HTMLSelectElement>('rend-type').value).toBe('simple')
        handle.unmount()
    })

    it('initial renderer type comes from per-objClassName history', async () => {
        setDefaultRendType('MolCoord', 'ribbon')
        const handle = mount()
        await flushPromises()
        expect(getById<HTMLSelectElement>('rend-type').value).toBe('ribbon')
        handle.unmount()
    })

    it('renderer name follows the selected type while still default', async () => {
        const handle = mount()
        await flushPromises()
        expect(getById<HTMLInputElement>('rend-name').value).toBe('simple1')

        mockCm.invokeService.mockClear()
        await act(async () => {
            setSelectValue(getById<HTMLSelectElement>('rend-type'), 'cartoon')
        })
        await flushPromises()

        const calls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(calls[calls.length - 1]).toMatchObject({
            kind: 'sceneRenderer', prefix: 'cartoon', sceneId: 7,
        })
        expect(getById<HTMLInputElement>('rend-name').value).toBe('cartoon1')
        handle.unmount()
    })

    it('renderer name does NOT follow after the user edits it', async () => {
        const handle = mount()
        await flushPromises()

        const nameInput = getById<HTMLInputElement>('rend-name')
        await act(async () => { setInputValue(nameInput, 'myrend') })
        await flushPromises()

        mockCm.invokeService.mockClear()
        await act(async () => {
            setSelectValue(getById<HTMLSelectElement>('rend-type'), 'ribbon')
        })
        await flushPromises()

        expect(proposeArgs().length).toBe(0)
        expect(nameInput.value).toBe('myrend')
        handle.unmount()
    })

    it('Create writes the selected renderer type to history', async () => {
        const handle = mount()
        await flushPromises()

        await act(async () => {
            setSelectValue(getById<HTMLSelectElement>('rend-type'), 'ribbon')
        })
        await flushPromises()

        const createBtn = findByText(document.body, 'button', 'Create') as HTMLButtonElement
        expect(createBtn).toBeTruthy()
        await act(async () => { createBtn.click() })
        await flushPromises()

        expect(getDefaultRendType('MolCoord')).toBe('ribbon')
        const raw = globalThis.localStorage.getItem(STORAGE_KEY)
        expect(raw && JSON.parse(raw)).toEqual({ MolCoord: 'ribbon' })
        expect(handle.captured?.rendOpts.rendererType).toBe('ribbon')
        handle.unmount()
    })

    it('Create with empty objClassName does not write history', async () => {
        const handle = mount({ objClassName: '' })
        await flushPromises()
        const createBtn = findByText(document.body, 'button', 'Create') as HTMLButtonElement
        await act(async () => { createBtn.click() })
        await flushPromises()
        expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
        handle.unmount()
    })
})
