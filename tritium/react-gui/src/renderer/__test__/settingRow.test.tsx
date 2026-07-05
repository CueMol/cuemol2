/**
 * Smoke test for the extracted SettingRow widget. Pins the control-kind
 * -> rendered-widget mapping and the onChange wiring for each kind.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

// The colour control renders the ColorPicker widget, which reads the theme
// for its Blueprint dark portal class.
vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark' }),
}))

import { SettingRow } from '../components/panes/settings/SettingRow'
import type { SettingDef } from '../components/panes/settings/settingsConfig'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

function mount(node: React.ReactElement): HTMLDivElement {
    container = document.createElement('div')
    document.body.appendChild(container)
    act(() => {
        root = createRoot(container!)
        root.render(node)
    })
    return container
}

afterEach(() => {
    if (root) act(() => root!.unmount())
    if (container) container.remove()
    root = null
    container = null
})

const def = (control: SettingDef['control']): SettingDef => ({
    key: 'k', label: 'L', description: 'D', category: 'c', control,
})

describe('SettingRow', () => {
    it('renders a select control and forwards the chosen value', () => {
        const onChange = vi.fn()
        const el = mount(
            <SettingRow
                def={def({ kind: 'select', options: ['A', 'B'] })}
                value="A"
                onChange={onChange}
            />,
        )
        const select = el.querySelector('select')
        expect(select).not.toBeNull()
        // Uses the h3-kit SelectField, not a raw Blueprint HTMLSelect.
        expect(el.querySelector('.h3-form-select')).not.toBeNull()
        act(() => {
            select!.value = 'B'
            select!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(onChange).toHaveBeenCalledWith('k', 'B')
    })

    it('renders each option in its own typeface when renderInOwnFont is set (font picker)', () => {
        const el = mount(
            <SettingRow
                def={def({ kind: 'select', options: ['Helvetica', 'Menlo'], renderInOwnFont: true })}
                value="Helvetica"
                onChange={vi.fn()}
            />,
        )
        const options = Array.from(el.querySelectorAll('option')) as HTMLOptionElement[]
        expect(options.map((o) => o.value)).toEqual(['Helvetica', 'Menlo'])
        // Each option previews its own family.
        expect(options[0].style.fontFamily).toBe('Helvetica')
        expect(options[1].style.fontFamily).toBe('Menlo')
    })

    it('renders the h3-kit NumericField (slider + compact input), not a raw Blueprint control', () => {
        const el = mount(
            <SettingRow
                def={def({ kind: 'number', min: 0, max: 10, step: 1, unit: 'px' })}
                value={5}
                onChange={vi.fn()}
            />,
        )
        // h3-kit NumericField renders `.h3-form-numeric-row` with a slider + input.
        expect(el.querySelector('.h3-form-numeric-row')).not.toBeNull()
        expect(el.querySelector('.h3-form-numeric')).not.toBeNull()
        // Legacy Blueprint-specific class must be gone.
        expect(el.querySelector('.config-setting-numeric')).toBeNull()
        // Unit suffix is shown.
        expect(el.querySelector('.h3-form-unit')?.textContent).toBe('px')
    })

    it('renders a toggle inline with the label and forwards the checked state', () => {
        const onChange = vi.fn()
        const el = mount(
            <SettingRow def={def({ kind: 'toggle' })} value={false} onChange={onChange} />,
        )
        // Toggle rows use the inline layout variant with the h3-kit SwitchField.
        expect(el.querySelector('.config-setting-toggle')).not.toBeNull()
        expect(el.querySelector('.h3-form-switch')).not.toBeNull()
        const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement
        expect(checkbox).not.toBeNull()
        // click() toggles `checked` and fires React's onChange through its
        // own value tracking (a manual `checked = true` + dispatch does not).
        act(() => { checkbox.click() })
        expect(onChange).toHaveBeenCalledWith('k', true)
    })

    it('renders the colour picker widget (not a native colour input)', () => {
        const el = mount(
            <SettingRow def={def({ kind: 'color' })} value="#FF0000" onChange={vi.fn()} />,
        )
        // Migrated to the unified ColorPicker -- no native input[type=color].
        expect(el.querySelector('input[type="color"]')).toBeNull()
        const picker = el.querySelector('.h3-color-widget')
        expect(picker).not.toBeNull()
        const textbox = el.querySelector('.h3-color-textbox input') as HTMLInputElement
        expect(textbox.value).toBe('#FF0000')
    })

    it('limits the colour picker to scene-independent modes', () => {
        const el = mount(
            <SettingRow def={def({ kind: 'color' })} value="#FF0000" onChange={vi.fn()} />,
        )
        const caret = el.querySelector('button.h3-color-caret-btn') as HTMLButtonElement
        act(() => {
            caret.click()
        })
        const labels = Array.from(
            document.querySelectorAll('.h3-color-modebar button'),
        ).map((b) => b.textContent)
        expect(labels).toEqual(['RGB', 'HSB', 'Palette'])
    })

    it('renders a path row with the h3-kit TextField + FormButton and forwards edits', () => {
        const onChange = vi.fn()
        const el = mount(
            <SettingRow def={def({ kind: 'path' })} value="/usr/bin/povray" onChange={onChange} />,
        )
        // h3-kit TextField (`.h3-form-input`) + FormButton (`.h3-form-btn`),
        // not the retired raw input.
        expect(el.querySelector('.config-setting-path-input')).toBeNull()
        const input = el.querySelector('.h3-form-input input') as HTMLInputElement
        expect(input).not.toBeNull()
        expect(input.value).toBe('/usr/bin/povray')
        expect(el.querySelector('.h3-form-btn')).not.toBeNull()
        // Drive the controlled input through React's value tracker (a plain
        // `input.value = ...` + dispatch is swallowed, like the checkbox case).
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )!.set!
        act(() => {
            setter.call(input, '/opt/povray')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        expect(onChange).toHaveBeenCalledWith('k', '/opt/povray')
    })
})
