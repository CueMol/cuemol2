/**
 * @file __test__/timeFieldInteraction.test.tsx
 * @description Interaction contract for the `TimeField` preset (the UXP
 * `timeedit` migration target, now built on `DragNumericField`).
 *
 * The ms <-> string conversion is pinned separately in `timeField.test.ts`;
 * this file pins the parts the preset adds on top of the shared drag widget:
 * the spin buttons step whole seconds, Up / Down steps the segment the caret
 * sits in (100 ms in the milliseconds field, as in UXP), a typed timecode is
 * parsed on Enter, and each interaction commits exactly once (one undo step).
 */

import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { TimeField } from '../h3-kit/form/TimeField'

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

function render(value: number, onCommit: (ms: number) => void) {
    act(() => {
        root.render(<TimeField value={value} onCommit={onCommit} />)
    })
}

function fieldRoot(): HTMLElement {
    const el = container.querySelector('.h3-form-time')
    if (!el) throw new Error('.h3-form-time not found')
    return el as HTMLElement
}

function valueText(): string {
    return fieldRoot().querySelector('.h3-form-drag-value')?.textContent ?? ''
}

function spinButtons(): [HTMLButtonElement, HTMLButtonElement] {
    const btns = fieldRoot().querySelectorAll('.h3-form-drag-spin')
    return [btns[0] as HTMLButtonElement, btns[1] as HTMLButtonElement] // [up, down]
}

/** Click into the field (press + release without movement) -> text edit. */
function enterEdit(): HTMLInputElement {
    act(() => {
        fieldRoot().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    })
    act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'))
    })
    const input = container.querySelector('input.h3-form-drag-input')
    if (!input) throw new Error('edit input not found')
    return input as HTMLInputElement
}

/** Put the caret at `pos` (a real caret, not the click's select-all). */
function setCaret(input: HTMLInputElement, pos: number) {
    input.setSelectionRange(pos, pos)
}

function keyDown(input: HTMLInputElement, key: string) {
    act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
}

function keyUp(input: HTMLInputElement, key: string) {
    act(() => {
        input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
}

function setInputValue(el: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
    )?.set
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('TimeField interaction', () => {
    it('renders the value as a timecode with up / down spin buttons', () => {
        render(1500, vi.fn())
        expect(valueText()).toBe('0:01.500')
        expect(spinButtons()).toHaveLength(2)
    })

    it('steps a whole second per spin click (UXP default segment) and commits once', () => {
        const onCommit = vi.fn()
        render(1500, onCommit)
        const [up] = spinButtons()
        act(() => {
            up.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
        })
        act(() => {
            document.dispatchEvent(new MouseEvent('mouseup'))
        })
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(2500)
    })

    it('does not step below the minimum', () => {
        const onCommit = vi.fn()
        render(0, onCommit)
        const [, down] = spinButtons()
        expect(down.disabled).toBe(true)
    })

    it('Up steps the segment under the caret -- 100 ms inside .mmm', () => {
        const onCommit = vi.fn()
        render(1500, onCommit)
        const input = enterEdit()
        setCaret(input, 6) // "0:01.5|00" -> milliseconds field
        keyDown(input, 'ArrowUp')
        expect(input.value).toBe('0:01.600')
        expect(onCommit).not.toHaveBeenCalled() // not until the key is released
        keyUp(input, 'ArrowUp')
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(1600)
    })

    it('accumulates a held Up into a single commit', () => {
        const onCommit = vi.fn()
        render(1500, onCommit)
        const input = enterEdit()
        setCaret(input, 3) // seconds field
        keyDown(input, 'ArrowUp')
        keyDown(input, 'ArrowUp') // OS auto-repeat
        keyDown(input, 'ArrowUp')
        keyUp(input, 'ArrowUp')
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(4500)
    })

    it('keeps stepping seconds when a click selected the whole draft', () => {
        // Regression: the first step used the "no caret" default (seconds) but
        // parked the caret at offset 0, so every repeat afterwards stepped
        // MINUTES instead.
        const onCommit = vi.fn()
        render(1500, onCommit)
        const input = enterEdit() // click selects all -> no caret
        keyDown(input, 'ArrowUp')
        keyDown(input, 'ArrowUp')
        keyUp(input, 'ArrowUp')
        expect(onCommit).toHaveBeenCalledWith(3500) // 1.5s + 1s + 1s
    })

    it('commits once when Enter follows a key step', () => {
        // Regression: the pending key-step hold also fired on the trailing
        // keyup, committing the same value a second time.
        const onCommit = vi.fn()
        render(1500, onCommit)
        const input = enterEdit()
        keyDown(input, 'ArrowUp')
        keyDown(input, 'Enter')
        keyUp(input, 'Enter')
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(2500)
    })

    it('commits a typed timecode on Enter', () => {
        const onCommit = vi.fn()
        render(1500, onCommit)
        const input = enterEdit()
        setInputValue(input, '2:07.250')
        keyDown(input, 'Enter')
        expect(onCommit).toHaveBeenCalledWith(127250)
    })

    it('applies a typed relative offset to the live value', () => {
        // Pins the wiring, not the grammar (that is timeField.test.ts): the
        // parser must see the value currently in the field.
        const onCommit = vi.fn()
        render(1500, onCommit)
        const input = enterEdit()
        setInputValue(input, '+2s')
        keyDown(input, 'Enter')
        expect(onCommit).toHaveBeenCalledWith(3500)
    })

    it('clamps a relative offset that would go below the minimum', () => {
        const onCommit = vi.fn()
        render(1500, onCommit)
        const input = enterEdit()
        setInputValue(input, '-10s')
        keyDown(input, 'Enter')
        expect(onCommit).toHaveBeenCalledWith(0)
    })

    it('keeps a typed millisecond value (stored at 1 ms resolution)', () => {
        const onCommit = vi.fn()
        render(0, onCommit)
        const input = enterEdit()
        setInputValue(input, '0:02.345')
        keyDown(input, 'Enter')
        expect(onCommit).toHaveBeenCalledWith(2345)
    })

    it('snaps a body drag to a tenth of a second', () => {
        const onCommit = vi.fn()
        render(1000, onCommit)
        act(() => {
            fieldRoot().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
        })
        act(() => {
            // PX_PER_STEP = 4 px per 100 ms -> 20 px = 500 ms.
            const ev = new MouseEvent('mousemove')
            Object.defineProperty(ev, 'movementX', { value: 20, configurable: true })
            document.dispatchEvent(ev)
        })
        act(() => {
            document.dispatchEvent(new MouseEvent('mouseup'))
        })
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith(1500)
    })
})
