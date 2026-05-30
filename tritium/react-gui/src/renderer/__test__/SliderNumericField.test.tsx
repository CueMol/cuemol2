/**
 * @file __test__/SliderNumericField.test.tsx
 * @description Unit tests for the SliderNumericField widget. Pins the
 * observable contract for the two bugs this widget had:
 *   - Typing into the numeric input must not snap the value to 0 when
 *     the field is momentarily empty (commit the typed number on blur).
 *   - The displayed value must be step-quantized, not a raw IEEE-754
 *     float (e.g. "0.3", not "0.30000000000000004") -- the slider feeds
 *     such floats in.
 * Also guards the `scale` contract used by percent-style consumers.
 */

import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { SliderNumericField } from '../components/widgets/SliderNumericField'

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
    const el = container.querySelector('input[type="number"]')
    if (!el) throw new Error('number input not found')
    return el as HTMLInputElement
}

// React 18 tracks focus via delegated focusin/focusout; the element must
// be focused first for `focusout` to map to onBlur.
function blurInput(el: HTMLInputElement) {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
}

const base = {
    label: 'Test:',
    value: 1,
    min: -10,
    max: 10,
    step: 0.1,
    onCommit: () => {},
}

function render(props: Partial<React.ComponentProps<typeof SliderNumericField>> = {}) {
    act(() => {
        root.render(<SliderNumericField {...base} {...props} />)
    })
}

describe('SliderNumericField', () => {
    it('shows the step-quantized value', () => {
        render({ value: 2.5 })
        expect(getNumberInput().value).toBe('2.5')
    })

    it('strips IEEE-754 float noise from the display', () => {
        // The slider feeds raw floats like 0.1 + 0.2 into the value;
        // the input must show the step-quantized form, not the noise.
        render({ value: 0.1 + 0.2, step: 0.1 })
        expect(getNumberInput().value).toBe('0.3')
    })

    it('commits a typed value on blur without snapping to 0 when emptied', () => {
        const onCommit = vi.fn()
        render({ value: 1, onCommit })
        const input = getNumberInput()
        act(() => { input.focus() })
        // Clear the field, then type a new value -- mid-edit "" must not
        // commit 0.
        act(() => { setInputValue(input, '') })
        act(() => { setInputValue(input, '2.5') })
        expect(onCommit).not.toHaveBeenCalled()
        act(() => { blurInput(input) })
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(2.5)
    })

    it('reverts to the current value when blurred while empty', () => {
        const onCommit = vi.fn()
        render({ value: 3, onCommit })
        const input = getNumberInput()
        act(() => { input.focus() })
        act(() => { setInputValue(input, '') })
        act(() => { blurInput(input) })
        expect(onCommit).not.toHaveBeenCalled()
        expect(input.value).toBe('3')
    })

    it('applies scale on commit (percent-style consumers)', () => {
        const onCommit = vi.fn()
        render({ value: 0.2, min: 0, max: 100, step: 1, scale: 100, onCommit })
        const input = getNumberInput()
        expect(input.value).toBe('20')
        act(() => { input.focus() })
        act(() => { setInputValue(input, '50') })
        act(() => { blurInput(input) })
        expect(onCommit).toHaveBeenCalledWith(0.5)
    })
})
