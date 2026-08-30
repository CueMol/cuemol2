/**
 * @file __test__/NumericField.test.tsx
 * @description Unit tests for the h3-kit NumericField. Pins the contract for
 * the bug it had: Blueprint's `NumericInput` is fully controlled once `value`
 * is set, so an `onChange` that only fires for a parseable number left
 * `value` unmoved while the field was empty / mid-edit (e.g. "-", "1."), and
 * the field snapped back to the last digit every keystroke -- making it
 * impossible to clear and retype. Same class of bug as SliderField
 * (see SliderField.test.tsx), now fixed at the shared component so
 * every consumer (MakeMolSurfDialog density, renderer property rows, etc.)
 * gets it once.
 */

import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { NumericField } from '@renderer/h3-kit/form'

void React

let container: HTMLDivElement
let root: Root

beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
})

function setInputValue(el: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
    )?.set
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

function getNumberInput(): HTMLInputElement {
    const el = container.querySelector('input.h3-form-numeric')
    if (!el) throw new Error('number input not found')
    return el as HTMLInputElement
}

// React 18 tracks focus via delegated focusin/focusout; the element must be
// focused first for `focusout` to map to onBlur.
function blurInput(el: HTMLInputElement) {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
}

const base = {
    value: 5,
    min: 0,
    max: 50,
    step: 1,
    slider: false,
    onChange: () => {},
}

function render(props: Partial<React.ComponentProps<typeof NumericField>> = {}) {
    act(() => {
        root.render(<NumericField {...base} {...props} />)
    })
}

/**
 * A controlled wrapper mirroring real consumers (MakeMolSurfDialog,
 * MultiNumInputRow, ...): `onChange` updates the state that feeds `value`
 * back in, so `onRelease`'s read of the latest `value` prop is meaningful.
 * `NumericField` itself does not manage `value` -- an inline no-op `onChange`
 * would leave `value` frozen and make a commit-on-blur/Enter assertion
 * meaningless.
 */
function ControlledNumericField(
    props: Partial<React.ComponentProps<typeof NumericField>> & { onRelease?: (v: number) => void },
) {
    const [value, setValue] = React.useState(props.value ?? base.value)
    return (
        <NumericField
            {...base}
            {...props}
            value={value}
            onChange={setValue}
        />
    )
}

function renderControlled(
    props: Partial<React.ComponentProps<typeof NumericField>> & { onRelease?: (v: number) => void } = {},
) {
    act(() => {
        root.render(<ControlledNumericField {...props} />)
    })
}

describe('NumericField', () => {
    it('shows the current value', () => {
        render({ value: 12 })
        expect(getNumberInput().value).toBe('12')
    })

    it('lets the field go empty mid-edit instead of snapping back to the old digit', () => {
        const onChange = vi.fn()
        render({ value: 9, onChange })
        const input = getNumberInput()
        act(() => { input.focus() })
        act(() => { setInputValue(input, '') })
        // No parseable number yet -- onChange must not fire for empty text,
        // but the field itself must stay empty (not revert to "9").
        expect(onChange).not.toHaveBeenCalled()
        expect(input.value).toBe('')
    })

    it('allows retyping a multi-digit value after clearing', () => {
        const onChange = vi.fn()
        render({ value: 9, onChange })
        const input = getNumberInput()
        act(() => { input.focus() })
        act(() => { setInputValue(input, '') })
        act(() => { setInputValue(input, '2') })
        act(() => { setInputValue(input, '25') })
        expect(onChange).toHaveBeenLastCalledWith(25)
        expect(input.value).toBe('25')
    })

    it('reverts the display to the current value when blurred while empty', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        render({ value: 7, onChange, onRelease })
        const input = getNumberInput()
        act(() => { input.focus() })
        act(() => { setInputValue(input, '') })
        act(() => { blurInput(input) })
        expect(onChange).not.toHaveBeenCalled()
        expect(onRelease).toHaveBeenCalledWith(7)
        expect(input.value).toBe('7')
    })

    it('commits the latest typed value via onRelease on blur', () => {
        const onRelease = vi.fn()
        renderControlled({ value: 5, onRelease })
        const input = getNumberInput()
        act(() => { input.focus() })
        act(() => { setInputValue(input, '30') })
        act(() => { blurInput(input) })
        expect(onRelease).toHaveBeenCalledWith(30)
    })

    it('commits the latest typed value via onRelease on Enter', () => {
        const onRelease = vi.fn()
        renderControlled({ value: 5, onRelease })
        const input = getNumberInput()
        act(() => { input.focus() })
        act(() => { setInputValue(input, '8') })
        act(() => {
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        })
        expect(onRelease).toHaveBeenCalledWith(8)
    })

    it('renders the slider by default and omits it when slider=false', () => {
        render({ slider: true })
        expect(container.querySelector('.h3-form-slider')).not.toBeNull()
        render({ slider: false })
        expect(container.querySelector('.h3-form-slider')).toBeNull()
    })
})
