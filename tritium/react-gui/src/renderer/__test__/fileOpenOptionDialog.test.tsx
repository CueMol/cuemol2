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
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}))

const mockCm = {
    invokeService: vi.fn(),
    getReaderDefaultOptions: vi.fn(),
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

import { FileOpenOptionDialog } from '@renderer/dialogs/fopen-opt-dlgs/FileOpenOptionDialog'
import {
    STORAGE_KEY,
    getDefaultRendType,
    setDefaultRendType,
} from '@renderer/dialogs/fopen-opt-dlgs/rendTypeHistory'
import type { FileOpenOptions } from '@renderer/dialogs/fopen-opt-dlgs/types'
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
 * Locate a control by the label of its form-kit `Field` row. The panes are
 * built from the h3-kit catalog, which owns the row markup, so the tests
 * address controls the way a user does (by their visible label) instead of
 * by an element id the catalog does not expose.
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
            readerName: 'pdb',
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
        mockCm.invokeService.mockReset()
        mockCm.getReaderDefaultOptions.mockReset()
        // Seed the PDB pane from the C++ reader defaults (the real source of
        // truth). Mirrors PDBFileReader's qif defaults.
        mockCm.getReaderDefaultOptions.mockResolvedValue({
            ok: true,
            values: {
                loadmodel: false, loadanisou: true, loadaltconf: true,
                loadsegid: false, build2ndry: true, autoTopoGen: true,
            },
        })
        // `proposeUniqName` now arrives via invokeService too; return
        // { name: prefix + (suffix style applied) } based on its args.
        mockCm.invokeService.mockImplementation((name: string, args: any) => {
            if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [] })
            if (name === 'validateSelection') return Promise.resolve({ ok: true })
            if (name === 'proposeUniqName') {
                if (args.kind === 'object') {
                    return Promise.resolve({ name: args.tryBare ? args.prefix : args.prefix + '1' })
                }
                return Promise.resolve({ name: args.prefix + '1' })
            }
            return Promise.resolve(null)
        })
    })

    afterEach(() => {
        // No timers to restore here.
    })

    it('on mount: requests scene-wide unique renderer name for the default type', async () => {
        const handle = mount()
        await flushPromises()
        const sceneRendCalls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(sceneRendCalls.length).toBeGreaterThanOrEqual(1)
        expect(sceneRendCalls[0]).toMatchObject({
            kind: 'sceneRenderer',
            prefix: 'simple',
            sceneId: 7,
        })
        const rendNameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        expect(rendNameInput.value).toBe('simple1')
        handle.unmount()
    })

    it('on mount: requests unique object name with tryBare + suffix:parens', async () => {
        const handle = mount()
        await flushPromises()
        const objCalls = proposeArgs().filter((a) => a.kind === 'object')
        expect(objCalls.length).toBeGreaterThanOrEqual(1)
        expect(objCalls[0]).toMatchObject({
            kind: 'object',
            prefix: '1mbn',
            sceneId: 7,
            tryBare: true,
            suffix: 'parens',
        })
        const objNameInput = controlByLabel<HTMLInputElement>('Object name', 'input')
        expect(objNameInput.value).toBe('1mbn')
        handle.unmount()
    })

    it('renderer name auto-updates on type change while flag=true', async () => {
        const handle = mount()
        await flushPromises()
        mockCm.invokeService.mockClear()

        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        await act(async () => { setSelectValue(select, 'ribbon') })
        await flushPromises()

        const sceneRendCalls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(sceneRendCalls.length).toBeGreaterThanOrEqual(1)
        expect(sceneRendCalls[sceneRendCalls.length - 1]).toMatchObject({
            kind: 'sceneRenderer', prefix: 'ribbon', sceneId: 7,
        })
        const rendNameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        expect(rendNameInput.value).toBe('ribbon1')
        handle.unmount()
    })

    it('renderer name does NOT auto-update on type change after user edits it', async () => {
        const handle = mount()
        await flushPromises()

        const rendNameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        await act(async () => { setInputValue(rendNameInput, 'myrend') })
        await flushPromises()
        expect(rendNameInput.value).toBe('myrend')

        mockCm.invokeService.mockClear()
        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        await act(async () => { setSelectValue(select, 'ribbon') })
        await flushPromises()

        const sceneRendCalls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(sceneRendCalls.length).toBe(0)
        expect(rendNameInput.value).toBe('myrend')
        handle.unmount()
    })

    it('clearing the renderer name re-arms auto-update on next type change', async () => {
        const handle = mount()
        await flushPromises()

        const rendNameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        // user types
        await act(async () => { setInputValue(rendNameInput, 'myrend') })
        await flushPromises()
        // user clears
        await act(async () => { setInputValue(rendNameInput, '') })
        await flushPromises()

        mockCm.invokeService.mockClear()
        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        await act(async () => { setSelectValue(select, 'cartoon') })
        await flushPromises()

        const sceneRendCalls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(sceneRendCalls.length).toBeGreaterThanOrEqual(1)
        expect(rendNameInput.value).toBe('cartoon1')
        handle.unmount()
    })

    // Regression: emptying the field mid-edit must NOT trigger a re-fetch.
    // UXP's XUL <textbox> only fires "change" on commit, so users never see
    // an in-progress empty state replaced. React onChange fires per keystroke,
    // so the auto-fill effect must not depend on the "is default" flag --
    // otherwise the field gets reset while the user is mid-edit.
    it('clearing the renderer name does NOT trigger immediate auto-fill', async () => {
        const handle = mount()
        await flushPromises()

        const rendNameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        expect(rendNameInput.value).toBe('simple1')

        // Ignore the initial mount fetches.
        mockCm.invokeService.mockClear()

        // User clears the field (e.g. Ctrl-A, Delete) -- purely a mid-edit
        // step before typing a custom name.
        await act(async () => { setInputValue(rendNameInput, '') })
        await flushPromises()

        // Critically: no sceneRenderer fetch should fire from the empty
        // transition alone. The field must stay empty so the user can type.
        const sceneRendCalls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
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

        const rendNameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        mockCm.invokeService.mockClear()

        // Simulate three keystrokes: 'a', 'ab', 'abc'.
        await act(async () => { setInputValue(rendNameInput, 'a') })
        await act(async () => { setInputValue(rendNameInput, 'ab') })
        await act(async () => { setInputValue(rendNameInput, 'abc') })
        await flushPromises()

        const sceneRendCalls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(sceneRendCalls.length).toBe(0)
        expect(rendNameInput.value).toBe('abc')

        handle.unmount()
    })

    it('initial rendererType comes from history when the value is in rendererTypes', async () => {
        setDefaultRendType('MolCoord', 'ribbon')
        const handle = mount()
        await flushPromises()
        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        expect(select.value).toBe('ribbon')
        const sceneRendCalls = proposeArgs().filter((a) => a.kind === 'sceneRenderer')
        expect(sceneRendCalls[0]).toMatchObject({
            kind: 'sceneRenderer', prefix: 'ribbon',
        })
        handle.unmount()
    })

    it('falls back to rendererTypes[0] when history value is not in rendererTypes', async () => {
        setDefaultRendType('MolCoord', 'spaghetti')
        const handle = mount()
        await flushPromises()
        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        expect(select.value).toBe('simple')
        handle.unmount()
    })

    it('Open writes the selected rendererType to history (per objType)', async () => {
        const handle = mount()
        await flushPromises()

        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
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
        mockCm.invokeService.mockImplementation((name: string, args: any) => {
            if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [] })
            if (name === 'validateSelection') return Promise.resolve({ ok: true })
            if (name !== 'proposeUniqName') return Promise.resolve(null)
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
        // Don't flush yet -- initial sceneRenderer probe is pending.
        // Switch type A -> B without resolving A first.
        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
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

        const rendNameInput = controlByLabel<HTMLInputElement>('Renderer name', 'input')
        expect(rendNameInput.value).toBe('cartoon1')
        handle.unmount()
    })

    // --- renderer presets (ADR-0046) ---

    it('shows a Presets optgroup when presetTypes is supplied and Open carries presetName', async () => {
        const handle = mount({
            presetTypes: [{ name: 'Default1RendPreset', desc: 'Default preset 1' }],
        })
        await flushPromises()

        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        const groups = Array.from(select.querySelectorAll('optgroup'))
        expect(groups.map((g) => g.label)).toEqual(['Presets', 'Renderer types'])
        // Plain type stays the default selection.
        expect(select.value).toBe('simple')

        await act(async () => { setSelectValue(select, 'Default1RendPreset') })
        await flushPromises()
        expect(controlByLabel<HTMLInputElement>('Renderer name', 'input').value).toBe('default1_1')

        const openBtn = findByText(document.body, 'button', 'Open') as HTMLButtonElement
        await act(async () => { openBtn.click() })
        await flushPromises()
        expect(handle.captured?.renderer.presetName).toBe('Default1RendPreset')
        expect(handle.captured?.renderer.rendererName).toBe('default1_1')
        handle.unmount()
    })

    it('keeps the flat option list (no optgroup) when presetTypes is absent', async () => {
        const handle = mount()
        await flushPromises()
        const select = controlByLabel<HTMLSelectElement>('Renderer type', 'select')
        expect(select.querySelectorAll('optgroup').length).toBe(0)
        expect(select.querySelectorAll('option').length).toBe(3)
        handle.unmount()
    })
})
