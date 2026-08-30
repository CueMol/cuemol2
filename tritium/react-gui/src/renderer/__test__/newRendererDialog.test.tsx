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
vi.mock('@renderer/contexts/ThemeContext', () => ({
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

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

import { NewRendererDialog } from '@renderer/dialogs/NewRendererDialog'
import type { NewRendererDialogResult } from '@renderer/dialogs/NewRendererDialog'
import {
    STORAGE_KEY,
    getDefaultRendType,
    setDefaultRendType,
} from '@renderer/dialogs/fopen-opt-dlgs/rendTypeHistory'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'

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

/**
 * Locate a control by the label of its form-kit `Field` row (the renderer
 * options pane is built from the h3-kit catalog, which owns the row markup
 * and exposes no element ids).
 */
function controlByLabel<T extends HTMLElement>(label: string, sel: string): T {
    const lab = Array.from(document.body.querySelectorAll('.h3-form-field-label'))
        .find((l) => (l.textContent ?? '').trim() === label)
    if (!lab) throw new Error(`field row "${label}" not found in mounted tree`)
    const row = lab.closest('.h3-form-field-row') as HTMLElement | null
    const el = row?.querySelector(sel) as T | null
    if (!el) throw new Error(`"${sel}" not found in the "${label}" row`)
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
        expect(controlByLabel<HTMLSelectElement>('Renderer type', 'select').value).toBe('simple')
        handle.unmount()
    })

    it('initial renderer type comes from per-objClassName history', async () => {
        setDefaultRendType('MolCoord', 'ribbon')
        const handle = mount()
        await flushPromises()
        expect(controlByLabel<HTMLSelectElement>('Renderer type', 'select').value).toBe('ribbon')
        handle.unmount()
    })

    it('renderer name follows the selected type while still default', async () => {
        const handle = mount()
        await flushPromises()
        expect(controlByLabel<HTMLInputElement>('Renderer name', 'input').value).toBe('simple1')

        mockCm.invokeService.mockClear()
        await act(async () => {
            setSelectValue(controlByLabel<HTMLSelectElement>('Renderer type', 'select'), 'cartoon')
        })
        await flushPromises()

        const calls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(calls[calls.length - 1]).toMatchObject({
            kind: 'sceneRenderer', prefix: 'cartoon', sceneId: 7,
        })
        expect(controlByLabel<HTMLInputElement>('Renderer name', 'input').value).toBe('cartoon1')
        handle.unmount()
    })

    it('renderer name does NOT follow after the user edits it', async () => {
        const handle = mount()
        await flushPromises()

        const nameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        await act(async () => { setInputValue(nameInput, 'myrend') })
        await flushPromises()

        mockCm.invokeService.mockClear()
        await act(async () => {
            setSelectValue(controlByLabel<HTMLSelectElement>('Renderer type', 'select'), 'ribbon')
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
            setSelectValue(controlByLabel<HTMLSelectElement>('Renderer type', 'select'), 'ribbon')
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

    // The Selection checkbox (Blueprint Checkbox) is distinct from the
    // "Center view" Switch (.bp5-switch); scope to .bp5-checkbox.
    function selectionCheckbox(): HTMLInputElement {
        return document.body.querySelector('.bp5-checkbox input') as HTMLInputElement
    }

    it('Selection checkbox defaults ON when the mol has a current selection', async () => {
        const handle = mount({ isMol: true, molID: 10, currentSel: "chain 'A'" })
        await flushPromises()
        expect(selectionCheckbox().checked).toBe(true)
        handle.unmount()
    })

    it('Selection checkbox defaults OFF when the mol has no selection', async () => {
        const handle = mount({ isMol: true, molID: 10, currentSel: '' })
        await flushPromises()
        expect(selectionCheckbox().checked).toBe(false)
        handle.unmount()
    })
})

// --- renderer presets (ADR-0046) ---

const PRESETS = [
    { name: 'Default1RendPreset', desc: 'Default preset 1' },
    { name: 'NoDescRendPreset', desc: '' },
]

describe('NewRendererDialog presets', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
        mockCm.invokeService.mockReset()
        mockCm.invokeService.mockImplementation((name: string, args: { prefix: string }) =>
            name === 'proposeUniqName'
                ? Promise.resolve({ name: args.prefix + '1' })
                : Promise.resolve(null),
        )
    })

    function selectionCheckbox(): HTMLInputElement {
        return document.body.querySelector('.bp5-checkbox input') as HTMLInputElement
    }

    it('renders a leading Presets optgroup (label=desc||name) but keeps the plain-type default', async () => {
        const handle = mount({ presetTypes: PRESETS })
        await flushPromises()
        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        const groups = Array.from(select.querySelectorAll('optgroup'))
        expect(groups.map((g) => g.label)).toEqual(['Presets', 'Renderer types'])
        const presetOpts = Array.from(groups[0].querySelectorAll('option'))
        expect(presetOpts.map((o) => o.value)).toEqual([
            'Default1RendPreset', 'NoDescRendPreset',
        ])
        // Label is desc, falling back to the style name when desc is empty.
        expect(presetOpts.map((o) => o.textContent)).toEqual([
            'Default preset 1', 'NoDescRendPreset',
        ])
        // Deliberate deviation from UXP: presets are offered but NOT the
        // default selection without history.
        expect(select.value).toBe('simple')
        handle.unmount()
    })

    it('picking a preset derives the short name, disables Selection, and Create carries presetName', async () => {
        const handle = mount({ presetTypes: PRESETS, isMol: true, molID: 10 })
        await flushPromises()

        mockCm.invokeService.mockClear()
        await act(async () => {
            setSelectValue(controlByLabel<HTMLSelectElement>('Renderer type', 'select'), 'Default1RendPreset')
        })
        await flushPromises()

        // Short prefix: 'Default1RendPreset' -> 'default1_' -> 'default1_1'.
        const calls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(calls[calls.length - 1]).toMatchObject({
            kind: 'sceneRenderer', prefix: 'default1_', sceneId: 7,
        })
        expect(controlByLabel<HTMLInputElement>('Renderer name', 'input').value).toBe('default1_1')
        // The preset's children carry sel from the style definition.
        expect(selectionCheckbox().disabled).toBe(true)

        const createBtn = findByText(document.body, 'button', 'Create') as HTMLButtonElement
        await act(async () => { createBtn.click() })
        await flushPromises()
        expect(handle.captured?.rendOpts.presetName).toBe('Default1RendPreset')
        expect(handle.captured?.rendOpts.rendererName).toBe('default1_1')
        // The preset pick is stored in the type history.
        expect(getDefaultRendType('MolCoord')).toBe('Default1RendPreset')
        handle.unmount()
    })

    it('switching back to a plain type clears presetName and re-enables Selection', async () => {
        const handle = mount({ presetTypes: PRESETS, isMol: true, molID: 10 })
        await flushPromises()
        await act(async () => {
            setSelectValue(controlByLabel<HTMLSelectElement>('Renderer type', 'select'), 'Default1RendPreset')
        })
        await flushPromises()
        await act(async () => {
            setSelectValue(controlByLabel<HTMLSelectElement>('Renderer type', 'select'), 'ribbon')
        })
        await flushPromises()
        expect(selectionCheckbox().disabled).toBe(false)
        const createBtn = findByText(document.body, 'button', 'Create') as HTMLButtonElement
        await act(async () => { createBtn.click() })
        await flushPromises()
        expect(handle.captured?.rendOpts.presetName).toBeUndefined()
        expect(handle.captured?.rendOpts.rendererType).toBe('ribbon')
        handle.unmount()
    })

    it('a preset history entry is restored when still offered, else falls back to the first type', async () => {
        setDefaultRendType('MolCoord', 'Default1RendPreset')
        const withPresets = mount({ presetTypes: PRESETS })
        await flushPromises()
        expect(controlByLabel<HTMLSelectElement>('Renderer type', 'select').value).toBe('Default1RendPreset')
        withPresets.unmount()

        // Same history, but no presets offered (e.g. group context / style
        // removed) -> falls back to the first plain type.
        const withoutPresets = mount()
        await flushPromises()
        expect(controlByLabel<HTMLSelectElement>('Renderer type', 'select').value).toBe('simple')
        withoutPresets.unmount()
    })
})
