/**
 * @file __test__/DragNumericField.test.tsx
 * @description Unit tests for the Blender-style DragNumericField. Pins the
 * observable interaction contract: single click -> text edit, body drag ->
 * value snapped to a multiple of `step` (Shift = finer `step/10`, Ctrl =
 * coarser `step*10`), the `<` `>` arrows increment by `step` and auto-repeat
 * while held (one undo step for the whole press), min/max clamping, and that the
 * widget holds focus as a unit. Pointer Lock is a best-effort
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

import { DragNumericField } from '../h3-kit/form/DragNumericField'

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
    const el = container.querySelector('.h3-form-drag')
    if (!el) throw new Error('.h3-form-drag not found')
    return el as HTMLElement
}

function getValueText(): string {
    return getRoot().querySelector('.h3-form-drag-value')?.textContent ?? ''
}

function getEditInput(): HTMLInputElement | null {
    return container.querySelector('input.h3-form-drag-input')
}

function getFill(): HTMLElement | null {
    return container.querySelector('.h3-form-drag-fill')
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

function getArrows(): [HTMLButtonElement, HTMLButtonElement] {
    const arrows = getRoot().querySelectorAll('.h3-form-drag-arrow')
    return [arrows[0] as HTMLButtonElement, arrows[1] as HTMLButtonElement]
}

function arrowMouseDown(el: HTMLButtonElement) {
    act(() => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    })
}

/**
 * Simulate losing pointer lock mid-drag (the browser fires this when the user
 * presses Esc). jsdom never acquires the lock, so `pointerLockElement` stays
 * null and the widget's guard treats this as "lock lost".
 */
function pointerLockLost() {
    act(() => {
        document.dispatchEvent(new Event('pointerlockchange'))
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

    it('honors an explicit fineSnap (Shift) that is not a 10th of step', () => {
        const onChange = vi.fn()
        // step 0.05, fineSnap 0.01: 7px * (0.05 / 8) = +0.04375 -> 1.74375,
        // snapped to 0.01 -> 1.74 (the default fine 0.005 would give 1.745).
        render({ value: 1.7, step: 0.05, fineSnap: 0.01, coarseSnap: 0.5, onChange })
        mouseDownBody()
        moveBy(7, { shiftKey: true })
        expect(onChange).toHaveBeenLastCalledWith(1.74)
        mouseUp()
    })

    it('honors an explicit coarseSnap (Ctrl) override', () => {
        const onChange = vi.fn()
        // step 0.05, coarseSnap 0.5: 40px * (0.05 / 8) = +0.25 -> 1.95,
        // snapped to 0.5 -> 2 (nearest multiple of 0.5).
        render({ value: 1.7, step: 0.05, fineSnap: 0.01, coarseSnap: 0.5, onChange })
        mouseDownBody()
        moveBy(40, { ctrlKey: true })
        expect(onChange).toHaveBeenLastCalledWith(2)
        mouseUp()
    })

    it('steps by `step` on a quick arrow press and commits once', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        render({ value: 1.0, step: 0.1, onChange, onRelease })
        const [left, right] = getArrows()
        // press -> one immediate step; release -> single commit.
        arrowMouseDown(right)
        expect(onChange).toHaveBeenLastCalledWith(1.1)
        expect(onRelease).not.toHaveBeenCalled()
        mouseUp()
        expect(onRelease).toHaveBeenCalledTimes(1)
        expect(onRelease).toHaveBeenLastCalledWith(1.1)
        // value is controlled (still 1.0), so the left arrow steps 1.0 -> 0.9.
        arrowMouseDown(left)
        expect(onChange).toHaveBeenLastCalledWith(0.9)
        mouseUp()
        expect(onRelease).toHaveBeenLastCalledWith(0.9)
    })

    it('auto-repeats while an arrow is held and commits once on release', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        const onDragStart = vi.fn()
        // Spy timers AFTER mount so React's own scheduling uses real timers;
        // the only setTimeout/setInterval after this point come from the press.
        render({ value: 1.0, step: 0.1, realtime: true, onChange, onRelease, onDragStart })

        let delayCb: (() => void) | null = null
        let intervalCb: (() => void) | null = null
        const setTimeoutSpy = vi
            .spyOn(globalThis, 'setTimeout')
            .mockImplementation(((cb: () => void) => {
                delayCb = cb
                return 1 as unknown as ReturnType<typeof setTimeout>
            }) as typeof setTimeout)
        const setIntervalSpy = vi
            .spyOn(globalThis, 'setInterval')
            .mockImplementation(((cb: () => void) => {
                intervalCb = cb
                return 2 as unknown as ReturnType<typeof setInterval>
            }) as typeof setInterval)
        const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {})
        const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})

        try {
            const [, right] = getArrows()
            arrowMouseDown(right)
            // onDragStart fires before the first onChange; immediate step -> 1.1.
            expect(onDragStart).toHaveBeenCalledTimes(1)
            expect(onChange).toHaveBeenLastCalledWith(1.1)
            expect(onRelease).not.toHaveBeenCalled()

            // Initial-delay timer elapses -> auto-repeat begins; each tick steps.
            act(() => delayCb!())
            act(() => intervalCb!())
            expect(onChange).toHaveBeenLastCalledWith(1.2)
            act(() => intervalCb!())
            expect(onChange).toHaveBeenLastCalledWith(1.3)

            // Release -> exactly one commit at the final held value.
            mouseUp()
            expect(onRelease).toHaveBeenCalledTimes(1)
            expect(onRelease).toHaveBeenLastCalledWith(1.3)
        } finally {
            setTimeoutSpy.mockRestore()
            setIntervalSpy.mockRestore()
            clearTimeoutSpy.mockRestore()
            clearIntervalSpy.mockRestore()
        }
    })

    it('stops auto-repeat at a bound but still commits the final value', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        render({ value: 9.9, min: 0, max: 10, step: 0.1, realtime: true, onChange, onRelease })

        let delayCb: (() => void) | null = null
        let intervalCb: (() => void) | null = null
        vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
            delayCb = cb
            return 1 as unknown as ReturnType<typeof setTimeout>
        }) as typeof setTimeout)
        vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: () => void) => {
            intervalCb = cb
            return 2 as unknown as ReturnType<typeof setInterval>
        }) as typeof setInterval)
        vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {})
        vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})

        try {
            const [, right] = getArrows()
            arrowMouseDown(right) // 9.9 -> 10 (reaches max)
            expect(onChange).toHaveBeenLastCalledWith(10)
            act(() => delayCb!())
            // Already at max: the tick is a no-op (no further onChange past 10).
            act(() => intervalCb!())
            expect(onChange).toHaveBeenLastCalledWith(10)
            mouseUp()
            expect(onRelease).toHaveBeenCalledTimes(1)
            expect(onRelease).toHaveBeenLastCalledWith(10)
        } finally {
            vi.restoreAllMocks()
        }
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

    // --- Realtime drag lifecycle ---

    it('does not fire drag-lifecycle callbacks when realtime is off (default)', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        const onDragStart = vi.fn()
        const onDragCancel = vi.fn()
        render({ value: 1.0, step: 0.1, onChange, onRelease, onDragStart, onDragCancel })
        mouseDownBody()
        moveBy(80)
        expect(onChange).toHaveBeenCalled()
        expect(onDragStart).not.toHaveBeenCalled()
        mouseUp()
        expect(onRelease).toHaveBeenCalledTimes(1)
        expect(onDragCancel).not.toHaveBeenCalled()
    })

    it('fires onDragStart once at drag begin and onRelease at end in realtime mode', () => {
        const onChange = vi.fn()
        const onRelease = vi.fn()
        const onDragStart = vi.fn()
        const onDragCancel = vi.fn()
        render({ value: 1.0, step: 0.1, realtime: true, onChange, onRelease, onDragStart, onDragCancel })
        mouseDownBody()
        moveBy(40) // cross threshold -> drag begins
        expect(onDragStart).toHaveBeenCalledTimes(1)
        moveBy(40) // another frame -> onChange again, but no second onDragStart
        expect(onDragStart).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2)
        mouseUp()
        expect(onRelease).toHaveBeenCalledTimes(1)
        expect(onDragCancel).not.toHaveBeenCalled()
    })

    it('cancels (onDragCancel, not onRelease) on Esc / pointer-lock loss in realtime mode', () => {
        const onRelease = vi.fn()
        const onDragCancel = vi.fn()
        const onDragStart = vi.fn()
        render({ value: 1.0, step: 0.1, realtime: true, onRelease, onDragCancel, onDragStart })
        mouseDownBody()
        moveBy(40)
        expect(onDragStart).toHaveBeenCalledTimes(1)
        pointerLockLost()
        expect(onDragCancel).toHaveBeenCalledTimes(1)
        expect(onRelease).not.toHaveBeenCalled()
    })

    it('commits (onRelease) on pointer-lock loss when realtime is off', () => {
        const onRelease = vi.fn()
        const onDragCancel = vi.fn()
        render({ value: 1.0, step: 0.1, onRelease, onDragCancel })
        mouseDownBody()
        moveBy(40)
        pointerLockLost()
        expect(onRelease).toHaveBeenCalledTimes(1)
        expect(onDragCancel).not.toHaveBeenCalled()
    })

    it('fires onDragCancel if unmounted mid-drag in realtime mode', () => {
        const onDragCancel = vi.fn()
        render({ value: 1.0, step: 0.1, realtime: true, onDragCancel })
        mouseDownBody()
        moveBy(40)
        act(() => root.unmount())
        expect(onDragCancel).toHaveBeenCalledTimes(1)
    })

    // --- min/max value-fill bar ---

    it('renders a fill bar at the value fraction when both bounds are finite', () => {
        render({ value: 5, min: 0, max: 10 })
        expect(getFill()?.style.width).toBe('50%')
    })

    it('clamps the fill bar to 0%/100% for out-of-range values', () => {
        render({ value: 20, min: 0, max: 10 })
        expect(getFill()?.style.width).toBe('100%')
        render({ value: -5, min: 0, max: 10 })
        expect(getFill()?.style.width).toBe('0%')
    })

    it('omits the fill bar when the range is not finite', () => {
        render({ value: 5, min: 0, max: Infinity })
        expect(getFill()).toBeNull()
    })

    it('hides the fill bar while text-editing', () => {
        render({ value: 5, min: 0, max: 10 })
        expect(getFill()).not.toBeNull()
        mouseDownBody()
        mouseUp() // click -> edit mode
        expect(getEditInput()).not.toBeNull()
        expect(getFill()).toBeNull()
    })
})
