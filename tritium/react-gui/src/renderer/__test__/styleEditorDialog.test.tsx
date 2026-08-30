/**
 * StyleEditorDialog wiring contract (UXP `style/style_editor.xul` port).
 *
 * Pins: fetches the style-set contents on open, renders the three tabs, and
 * each Add / Delete routes to the matching `styleSetEdit` worker service.
 * ColorField + ColorPickerProvider are stubbed so the test targets the dialog
 * CRUD wiring, not the colour picker internals.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light', toggleTheme: () => undefined, setTheme: () => undefined }),
}))
vi.mock('@renderer/h3-kit/colorpicker/ColorPickerContext', () => ({
    ColorPickerProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@renderer/h3-kit/form/ColorField', () => ({
    ColorField: ({ value }: { value: string }) => <span data-testid="color">{value}</span>,
}))

const cmHolder = vi.hoisted(() => ({ cm: null as unknown }))
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({ cm: cmHolder.cm, cueMolReady: !!cmHolder.cm }),
}))

import { StyleEditorDialog } from '@renderer/dialogs/StyleEditorDialog'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'

const CONTENTS = {
    ok: true,
    name: 'myStyle',
    readonly: false,
    colors: [{ name: 'red', hex: '#ff0000' }],
    selections: [{ name: 'sel1', value: 'A.10' }],
    styles: [{ name: 'st1', type: 'renderer' }],
}

let invokeService: ReturnType<typeof vi.fn>

function makeCm() {
    invokeService = vi.fn((name: string) =>
        name === 'getStyleSetContents' ? Promise.resolve(CONTENTS) : Promise.resolve({ ok: true }),
    )
    return { invokeService }
}


function setNativeValue(el: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function mount() {
    const view = mountTree(
        <StyleEditorDialog
            visible
            styleSetId={5}
            scopeId={0}
            sceneId={1}
            styleName="myStyle"
            onClose={vi.fn()}
        />,
    )
    await flushPromises()
    return view
}

beforeEach(() => {
    cmHolder.cm = makeCm()
})
afterEach(() => {
    document.body.innerHTML = ''
})

describe('StyleEditorDialog', () => {
    it('fetches contents on open and renders the three tabs', async () => {
        const view = await mount()
        expect(invokeService).toHaveBeenCalledWith('getStyleSetContents', { styleSetId: 5 })
        const tabs = Array.from(document.body.querySelectorAll('[role="tab"]')).map((t) => t.textContent)
        expect(tabs).toEqual(['Color', 'Selection', 'Styles'])
        expect(document.body.textContent).toContain('red')
        view.unmount()
    })

    it('deleting a color routes to removeStyleSetColor', async () => {
        const view = await mount()
        const del = document.body.querySelector(
            '[aria-label="Delete color red"]',
        ) as HTMLButtonElement
        act(() => del.click())
        expect(invokeService).toHaveBeenCalledWith('removeStyleSetColor', {
            sceneId: 1, styleSetId: 5, name: 'red',
        })
        view.unmount()
    })

    it('adding a color routes to setStyleSetColor with a default hex', async () => {
        const view = await mount()
        const input = document.body.querySelector(
            'input[placeholder="New color name"]',
        ) as HTMLInputElement
        act(() => setNativeValue(input, 'green'))
        // The enabled "Add" is the colour one (selection Add stays disabled).
        const add = Array.from(document.body.querySelectorAll('button')).find(
            (b) => b.textContent === 'Add' && !b.disabled,
        ) as HTMLButtonElement
        act(() => add.click())
        expect(invokeService).toHaveBeenCalledWith('setStyleSetColor', {
            sceneId: 1, styleSetId: 5, scopeId: 0, name: 'green', colorStr: '#ffffff',
        })
        view.unmount()
    })

    it('deleting a style entry routes to removeStyleSetStyle', async () => {
        const view = await mount()
        const del = document.body.querySelector(
            '[aria-label="Delete style st1"]',
        ) as HTMLButtonElement
        act(() => del.click())
        expect(invokeService).toHaveBeenCalledWith('removeStyleSetStyle', {
            sceneId: 1, styleSetId: 5, name: 'st1',
        })
        view.unmount()
    })
})
