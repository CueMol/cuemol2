/**
 * @file __test__/DragNumericField.test.tsx
 * @description Unit tests for the Blender-style DragNumericField. Pins the
 * observable interaction contract: single click -> text edit, body drag ->
 * value snapped to a multiple of `step` (Shift = finer `step/10`, Ctrl =
 * coarser `step*10`), the `<` `>` arrows increment by `step`, min/max clamping,
 * and that the widget holds focus as a unit. Pointer Lock is a best-effort
 * enhancement absent in jsdom, so drags are exercised by dispatching
 * `mousemove` with explicit `movementX` -- exactly the input the widget
 * accumulates.
 *
 * Drag math under test: PX_PER_STEP = 8, so the raw value moves by
 * `step / 8` per pixel, then snaps to the active granularity.
 */

import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { DragNumericField } from '../components/widgets/form/DragNumericField'

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

function getRoot(): HTMLElement {
    const el = container.querySelector('.fk-drag')
    if (!el) throw new Error('.fk-drag not found')
    return el as HTMLElement
}

function getValueText(): string {
    return getRoot().querySelector('.fk-drag-value')?.textContent ?? ''
}

function getEditInput(): HTMLInputElement | null {
    return container.querySelector('input.fk-drag-input')
}

function setInputValue(el: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
    )?.set
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

function mouseDownBody() {
    act(() => {
        getRoot().dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, button: 0 }),
        )
    })
}

function moveBy(movementX: number, mods: { shiftKey?: boolean; ctrlKey?: boolean } = {}) {
    act(() => {
        // jsdom does not honor `movementX` in the MouseEvent init dict, so
        // define it on the event instance directly.
        const ev = new MouseEvent('mousemove', mods)
        Object.defineProperty(ev, 'movementX', { value: movementX, configurable: true })
        document.dispatchEvent(ev)
    })
}

function mouseUp() {
    act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'))
    })
}

const base = {
    value: 1.0,
    onChange: () => {},
    min: 0,
    max: 10,
    step: 0.1,
}

function render(props: Partial<React.ComponentProps<typeof DragNumericField>> = {}) {
    act(() => {
        root.render(<DragNumericField {...base} {...props} />)
    })
}

describe('DragNumericField', () => {
    it('renders the value formatted to the fine-snap precision, plus unit', () => {
        // step 0.1 -> fine snap 0.01 -> 2 decimals.
        render({ value: 1.0, unit: 'A' })
        expect(getValueText()).toContain('1.00')
        expect(getValueText()).toContain('A')
    })

    it('exposes a single focusable widget (tabIndex 0 on the root)', () => {
        render()
        expect(getRoot().getAttribute('tabindex')).toBe('0')
    })

    it('enters text-edit mode on a click (press + release, no movement)', () => {
        render({ value: 1.0 })
        mouseDownBody()
        mouseUp()
        const input = getEditInput()
        expect(input).not.toBeNull()
        expect(Number(input!.value)).toBe(1)
    })

    it('commits the typed value on Enter', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        render({ value: 1.0, onChange, onRelease })
        mouseDownBody()
        mouseUp()
        const input = getEditInput()!
        act(() => { setInputValue(input, '2.5') })
        act(() => {
            input.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
            )
        })
        expect(onChange).toHaveBeenCalledWith(2.5)
        expect(onRelease).toHaveBeenCalledWith(2.5)
        expect(getEditInput()).toBeNull()
    })

    it('cancels the edit on Escape without committing', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        render({ value: 1.0, onChange, onRelease })
        mouseDownBody()
        mouseUp()
        const input = getEditInput()!
        act(() => { setInputValue(input, '2.5') })
        act(() => {
            input.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
            )
        })
        expect(onChange).not.toHaveBeenCalled()
        expect(onRelease).not.toHaveBeenCalled()
        expect(getValueText()).toContain('1.00')
    })

    it('does not commit 0 when blurred while the edit field is empty', () => {
        const onChange = vi.fn()
        render({ value: 1.0, onChange })
        mouseDownBody()
        mouseUp()
        const input = getEditInput()!
        act(() => { setInputValue(input, '') })
        act(() => {
            input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
        })
        expect(onChange).not.toHaveBeenCalled()
        expect(getValueText()).toContain('1.00')
    })

    it('drags right, snapping to the normal step (movementX accumulation)', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        // 80px * (0.1 / 8) = +1.0 -> 2.0, snapped to 0.1 -> 2.
        render({ value: 1.0, step: 0.1, onChange, onRelease })
        mouseDownBody()
        moveBy(80)
        expect(onChange).toHaveBeenLastCalledWith(2)
        mouseUp()
        expect(onRelease).toHaveBeenCalledTimes(1)
    })

    it('drags left to decrease the value', () => {
        const onChange = vi.fn()
        // -40px * (0.1 / 8) = -0.5 -> 0.5.
        render({ value: 1.0, step: 0.1, onChange })
        mouseDownBody()
        moveBy(-40)
        expect(onChange).toHaveBeenLastCalledWith(0.5)
        mouseUp()
    })

    it('treats sub-threshold movement as a click (edit), not a drag', () => {
        const onChange = vi.fn()
        render({ value: 1.0, onChange })
        mouseDownBody()
        moveBy(2) // below DRAG_THRESHOLD_PX (4)
        mouseUp()
        expect(onChange).not.toHaveBeenCalled()
        expect(getEditInput()).not.toBeNull()
    })

    it('Shift snaps to the fine granularity (step / 10)', () => {
        const onChange = vi.fn()
        // 7px * (0.1 / 8) = +0.0875 -> 1.0875, snapped to 0.01 -> 1.09
        // (normal 0.1-snap would give 1.1, so this proves the finer grid).
        render({ value: 1.0, step: 0.1, onChange })
        mouseDownBody()
        moveBy(7, { shiftKey: true })
        expect(onChange).toHaveBeenLastCalledWith(1.09)
        mouseUp()
    })

    it('Ctrl snaps to the coarse granularity (step * 10)', () => {
        const onChange = vi.fn()
        // 60px * (0.1 / 8) = +0.75 -> 1.75, snapped to 1 -> 2
        // (normal 0.1-snap would give 1.8).
        render({ value: 1.0, step: 0.1, onChange })
        mouseDownBody()
        moveBy(60, { ctrlKey: true })
        expect(onChange).toHaveBeenLastCalledWith(2)
        mouseUp()
    })

    it('steps by `step` via the arrow affordances and commits once', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        render({ value: 1.0, step: 0.1, onChange, onRelease })
        const [left, right] = container.querySelectorAll('.fk-drag-arrow')
        act(() => { (right as HTMLButtonElement).click() })
        expect(onChange).toHaveBeenLastCalledWith(1.1)
        expect(onRelease).toHaveBeenLastCalledWith(1.1)
        act(() => { (left as HTMLButtonElement).click() })
        expect(onChange).toHaveBeenLastCalledWith(0.9)
    })

    it('clamps to max on drag', () => {
        const onChange = vi.fn()
        render({ value: 9.9, min: 0, max: 10, step: 0.1, onChange })
        mouseDownBody()
        moveBy(80) // +1.0 -> 10.9, clamped to 10
        expect(onChange).toHaveBeenLastCalledWith(10)
        mouseUp()
    })

    it('is inert when disabled', () => {
        const onChange = vi.fn()
        render({ value: 1.0, disabled: true, onChange })
        expect(getRoot().getAttribute('tabindex')).toBe('-1')
        mouseDownBody()
        moveBy(80)
        mouseUp()
        expect(onChange).not.toHaveBeenCalled()
        expect(getEditInput()).toBeNull()
    })
})
