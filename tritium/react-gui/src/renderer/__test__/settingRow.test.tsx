/**
 * Smoke test for the extracted SettingRow widget. Pins the control-kind
 * -> rendered-widget mapping and the onChange wiring for each kind.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
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
        act(() => {
            select!.value = 'B'
            select!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(onChange).toHaveBeenCalledWith('k', 'B')
    })

    it('renders a numeric control', () => {
        const el = mount(
            <SettingRow
                def={def({ kind: 'number', min: 0, max: 10, step: 1 })}
                value={5}
                onChange={vi.fn()}
            />,
        )
        expect(el.querySelector('.config-setting-numeric')).not.toBeNull()
    })

    it('renders a toggle inline with the label and forwards the checked state', () => {
        const onChange = vi.fn()
        const el = mount(
            <SettingRow def={def({ kind: 'toggle' })} value={false} onChange={onChange} />,
        )
        // Toggle rows use the inline layout variant.
        expect(el.querySelector('.config-setting-toggle')).not.toBeNull()
        const checkbox = el.querySelector('input[type="checkbox"]') as HTMLInputElement
        expect(checkbox).not.toBeNull()
        // click() toggles `checked` and fires React's onChange through its
        // own value tracking (a manual `checked = true` + dispatch does not).
        act(() => { checkbox.click() })
        expect(onChange).toHaveBeenCalledWith('k', true)
    })

    it('renders a color control with the hex value shown', () => {
        const el = mount(
            <SettingRow def={def({ kind: 'color' })} value="#FF0000" onChange={vi.fn()} />,
        )
        const colorInput = el.querySelector('input[type="color"]') as HTMLInputElement
        expect(colorInput).not.toBeNull()
        expect(colorInput.value).toBe('#ff0000')
        expect(el.querySelector('.config-setting-color-hex')?.textContent).toBe('#FF0000')
    })
})
