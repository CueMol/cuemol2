/**
 * @file __test__/timeFieldInteraction.test.tsx
 * @description Interaction contract of the segmented `TimeField` (the UXP
 * `timeedit` migration target). The ms <-> string arithmetic is pinned in
 * `timeMath.test.ts`; this file pins what the widget does with it: which
 * segment a gesture lands on, what each gesture changes, and -- above all --
 * the lifecycle (`onDragStart` / `onChange` / `onRelease` / `onDragCancel`)
 * that `useRealtimeDragProp` and the undo stack rely on: every interaction
 * releases exactly once, an abandoned one cancels instead.
 *
 * The harness is a controlled parent: it echoes `onChange` into `value`, and
 * on `onDragCancel` restores the last released value (the parent's job).
 */

import React, { act, useRef, useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import { TimeField } from '@renderer/h3-kit/form'
import type { TimeFieldProps } from '@renderer/h3-kit/form/TimeField'

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
    vi.restoreAllMocks()
})

type Spies = {
    onChange: ReturnType<typeof vi.fn>
    onRelease: ReturnType<typeof vi.fn>
    onDragStart: ReturnType<typeof vi.fn>
    onDragCancel: ReturnType<typeof vi.fn>
}

type HarnessOpts = Partial<Pick<TimeFieldProps, 'min' | 'max' | 'realtime' | 'disabled'>>

function mount(initial: number, opts: HarnessOpts = {}): Spies {
    const spies: Spies = {
        onChange: vi.fn(),
        onRelease: vi.fn(),
        onDragStart: vi.fn(),
        onDragCancel: vi.fn(),
    }
    const Harness: React.FC = () => {
        const [v, setV] = useState(initial)
        const committed = useRef(initial)
        return (
            <TimeField
                value={v}
                onChange={(x) => {
                    spies.onChange(x)
                    setV(x)
                }}
                onRelease={(x) => {
                    spies.onRelease(x)
                    committed.current = x
                    setV(x)
                }}
                onDragStart={spies.onDragStart}
                onDragCancel={() => {
                    spies.onDragCancel()
                    setV(committed.current)
                }}
                {...opts}
            />
        )
    }
    act(() => {
        root.render(<Harness />)
    })
    return spies
}

function fieldRoot(): HTMLElement {
    const el = container.querySelector('.h3-form-time')
    if (!el) throw new Error('.h3-form-time not found')
    return el as HTMLElement
}

function seg(unit: string): HTMLElement {
    const el = fieldRoot().querySelector(`[data-unit="${unit}"]`)
    if (!el) throw new Error(`segment ${unit} not found`)
    return el as HTMLElement
}

function segsText(): string {
    return fieldRoot().querySelector('.h3-form-time-segs')?.textContent ?? ''
}

function activeUnit(): string | undefined {
    return (fieldRoot().querySelector('.h3-form-time-seg.is-active') as HTMLElement | null)
        ?.dataset.unit
}

function spinButtons(): [HTMLButtonElement, HTMLButtonElement] {
    const btns = fieldRoot().querySelectorAll('.h3-form-time-spin')
    return [btns[0] as HTMLButtonElement, btns[1] as HTMLButtonElement] // [up, down]
}

function editInput(): HTMLInputElement | null {
    return container.querySelector('input.h3-form-time-input')
}

type Mods = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }

function mouseDown(el: HTMLElement, init: MouseEventInit = {}) {
    act(() => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...init }))
    })
}

function mouseMove(dx: number, mods: Mods = {}) {
    act(() => {
        const ev = new MouseEvent('mousemove', mods)
        Object.defineProperty(ev, 'movementX', { value: dx, configurable: true })
        document.dispatchEvent(ev)
    })
}

function mouseUp() {
    act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'))
    })
}

function keyDown(el: HTMLElement, key: string, mods: Mods = {}) {
    act(() => {
        el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }))
    })
}

function keyUp(el: HTMLElement, key: string) {
    act(() => {
        el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
}

function wheel(el: HTMLElement, deltaY: number, mods: Mods = {}): WheelEvent {
    const ev = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...mods })
    act(() => {
        el.dispatchEvent(ev)
    })
    return ev
}

function setInputValue(el: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value',
    )?.set
    act(() => {
        setter?.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

function focusRoot(): HTMLElement {
    const el = fieldRoot()
    act(() => el.focus())
    return el
}

/** Stub the segment boxes so a press between them can be resolved. */
function stubSegmentRects(boxes: Record<string, [number, number]>) {
    for (const [unit, [left, right]] of Object.entries(boxes)) {
        Object.defineProperty(seg(unit), 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0 }),
        })
    }
}

describe('TimeField segments', () => {
    it('renders M:SS.mmm as three segments that concatenate to the timecode', () => {
        mount(1500)
        expect(segsText()).toBe('0:01.500')
        const units = [...fieldRoot().querySelectorAll('[data-unit]')].map(
            (el) => (el as HTMLElement).dataset.unit,
        )
        expect(units).toEqual(['m', 's', 'ms'])
        expect(activeUnit()).toBe('s') // the UXP default segment
        expect(spinButtons()).toHaveLength(2)
    })

    it('shows an hours segment from one hour on', () => {
        mount(3661500)
        const units = [...fieldRoot().querySelectorAll('[data-unit]')].map(
            (el) => (el as HTMLElement).dataset.unit,
        )
        expect(units).toEqual(['h', 'm', 's', 'ms'])
        expect(segsText()).toBe('1:01:01.500')
    })

    it('a click selects the pressed segment and focuses the field', () => {
        const spies = mount(1500)
        mouseDown(seg('ms'))
        mouseUp()
        expect(activeUnit()).toBe('ms')
        expect(document.activeElement).toBe(fieldRoot())
        expect(spies.onChange).not.toHaveBeenCalled()
        expect(spies.onRelease).not.toHaveBeenCalled()
    })

    it('a click on a separator lands on the nearest segment', () => {
        mount(1500)
        stubSegmentRects({ m: [0, 20], s: [30, 50], ms: [60, 90] })
        const sep = fieldRoot().querySelector('.h3-form-time-sep') as HTMLElement
        mouseDown(sep, { clientX: 68 }) // centres: m 10, s 40, ms 75
        mouseUp()
        expect(activeUnit()).toBe('ms')
    })
})

describe('TimeField keyboard', () => {
    it('digits overwrite the active segment, carry, and move on when it is full', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, '7')
        expect(segsText()).toBe('0:07.500')
        expect(spies.onRelease).not.toHaveBeenCalled()
        keyDown(el, '5')
        expect(segsText()).toBe('1:15.500') // 75 s carries into the minutes
        // Two digits fill the seconds: one release, and the cursor moves on.
        expect(spies.onDragStart).toHaveBeenCalledTimes(1)
        expect(spies.onChange.mock.calls.map((c) => c[0])).toEqual([7500, 75500])
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(75500)
        expect(activeUnit()).toBe('ms')
    })

    it('a pending digit buffer is released by a segment move', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, '7')
        keyDown(el, 'ArrowRight')
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(7500)
        expect(activeUnit()).toBe('ms')
    })

    it('a pending digit buffer is released when focus leaves the field', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, '7')
        act(() => el.blur())
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(7500)
    })

    it('Up / Down step the active segment; Shift is a tenth, Ctrl ten times', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'ArrowUp')
        expect(segsText()).toBe('0:02.500')
        expect(spies.onRelease).not.toHaveBeenCalled() // not until the key is released
        keyUp(el, 'ArrowUp')
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(2500)

        keyDown(el, 'ArrowUp', { shiftKey: true })
        keyUp(el, 'ArrowUp')
        expect(segsText()).toBe('0:02.600')

        keyDown(el, 'ArrowDown', { ctrlKey: true })
        keyUp(el, 'ArrowDown')
        expect(segsText()).toBe('0:00.000') // 2.6 s - 10 s clamps at min
        expect(spies.onRelease).toHaveBeenCalledTimes(3)
    })

    it('a held Up is one run: announced once, released once', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'ArrowUp')
        keyDown(el, 'ArrowUp') // OS auto-repeat
        keyDown(el, 'ArrowUp')
        keyUp(el, 'ArrowUp')
        expect(spies.onDragStart).toHaveBeenCalledTimes(1)
        expect(spies.onChange.mock.calls.map((c) => c[0])).toEqual([2500, 3500, 4500])
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(4500)
    })

    it('Esc during a key run abandons it', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'ArrowUp')
        keyDown(el, 'ArrowUp')
        keyDown(el, 'Escape')
        keyUp(el, 'ArrowUp')
        expect(spies.onDragCancel).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).not.toHaveBeenCalled()
        expect(segsText()).toBe('0:01.500') // the parent restored it
    })

    it('Esc with nothing in flight is left to the container', () => {
        mount(1500)
        const el = focusRoot()
        const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        act(() => {
            el.dispatchEvent(ev)
        })
        expect(ev.defaultPrevented).toBe(false)
    })

    it('Left / Right / Home / End move the active segment without wrapping', () => {
        mount(1500)
        const el = focusRoot()
        keyDown(el, 'ArrowLeft')
        expect(activeUnit()).toBe('m')
        keyDown(el, 'ArrowLeft')
        expect(activeUnit()).toBe('m') // no wrap
        keyDown(el, 'End')
        expect(activeUnit()).toBe('ms')
        keyDown(el, 'ArrowRight')
        expect(activeUnit()).toBe('ms') // no wrap
        keyDown(el, 'Home')
        expect(activeUnit()).toBe('m')
        keyDown(el, 'ArrowRight')
        expect(activeUnit()).toBe('s')
    })

    it('Backspace zeroes the active segment as one change + release', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'Backspace')
        expect(segsText()).toBe('0:00.500')
        expect(spies.onChange).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(500)
        expect(spies.onDragStart).not.toHaveBeenCalled()
    })

    it('keeps the active segment by unit when the hours segment appears', () => {
        mount(3599000) // 59:59.000
        const el = focusRoot()
        keyDown(el, 'ArrowLeft') // minutes
        keyDown(el, 'ArrowUp') // 60 min -> 1:00:59.000, hours appear
        keyUp(el, 'ArrowUp')
        expect(segsText()).toBe('1:00:59.000')
        expect(activeUnit()).toBe('m')
    })
})

describe('TimeField expression editor', () => {
    it('Enter opens the editor over the timecode; Enter commits a typed value once', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'Enter')
        const input = editInput()
        expect(input).not.toBeNull()
        expect(input!.value).toBe('0:01.500')
        expect(fieldRoot().classList.contains('is-editing')).toBe(true)

        setInputValue(input!, '2:07.250')
        keyDown(input!, 'Enter')
        expect(editInput()).toBeNull()
        expect(spies.onChange).toHaveBeenCalledTimes(1)
        expect(spies.onChange).toHaveBeenCalledWith(127250)
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(127250)
        expect(spies.onDragStart).not.toHaveBeenCalled()
        expect(segsText()).toBe('2:07.250')
    })

    it('applies a relative offset to the live value and clamps at min', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'Enter')
        setInputValue(editInput()!, '+2s')
        keyDown(editInput()!, 'Enter')
        expect(spies.onRelease).toHaveBeenLastCalledWith(3500)

        keyDown(el, 'Enter')
        setInputValue(editInput()!, '-10s')
        keyDown(editInput()!, 'Enter')
        expect(spies.onRelease).toHaveBeenLastCalledWith(0)
    })

    it('typing + or - opens the editor seeded with that sign', () => {
        mount(1500)
        const el = focusRoot()
        keyDown(el, '+')
        expect(editInput()?.value).toBe('+')
    })

    it('discards malformed text and Esc, keeping the active segment', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'ArrowLeft') // minutes
        keyDown(el, 'Enter')
        setInputValue(editInput()!, 'abc')
        keyDown(editInput()!, 'Enter')
        expect(editInput()).toBeNull()
        expect(spies.onChange).not.toHaveBeenCalled()
        expect(spies.onRelease).not.toHaveBeenCalled()

        keyDown(el, 'Enter')
        setInputValue(editInput()!, '9:00')
        keyDown(editInput()!, 'Escape')
        expect(editInput()).toBeNull()
        expect(spies.onChange).not.toHaveBeenCalled()
        expect(segsText()).toBe('0:01.500')
        expect(activeUnit()).toBe('m')
    })

    it('Enter with a digit buffer pending only releases it', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, '7')
        keyDown(el, 'Enter')
        expect(editInput()).toBeNull()
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(7500)
        keyDown(el, 'Enter') // now the editor opens
        expect(editInput()).not.toBeNull()
    })

    it('double-click opens the editor', () => {
        mount(1500)
        act(() => {
            seg('s').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, button: 0 }))
        })
        expect(editInput()).not.toBeNull()
    })
})

describe('TimeField drag', () => {
    it('scrubs the segment under the pointer by its unit (4 px per unit)', () => {
        const spies = mount(1500)
        mouseDown(seg('ms'))
        mouseMove(20)
        mouseUp()
        expect(spies.onRelease).toHaveBeenLastCalledWith(1505)

        mouseDown(seg('s'))
        mouseMove(20)
        mouseUp()
        expect(spies.onRelease).toHaveBeenLastCalledWith(6505)

        mouseDown(seg('m'))
        mouseMove(20)
        mouseUp()
        expect(spies.onRelease).toHaveBeenLastCalledWith(306505)
        expect(spies.onRelease).toHaveBeenCalledTimes(3)
    })

    it('Shift scrubs at a tenth of the rate in tenth steps; Ctrl snaps to ten units', () => {
        const spies = mount(1500)
        mouseDown(seg('s'))
        mouseMove(20, { shiftKey: true }) // 20 px * 25 ms = 500 ms, snapped to 100 ms
        mouseUp()
        expect(spies.onRelease).toHaveBeenLastCalledWith(2000)

        mouseDown(seg('s'))
        mouseMove(40, { ctrlKey: true }) // 10 s, snapped to 10 s
        mouseUp()
        expect(spies.onRelease).toHaveBeenLastCalledWith(12000)
    })

    it('snaps the delta, not the value, so the other segments are kept', () => {
        const spies = mount(2345)
        mouseDown(seg('s'))
        mouseMove(20)
        mouseUp()
        expect(spies.onRelease).toHaveBeenCalledWith(7345)
        expect(segsText()).toBe('0:07.345')
    })

    it('a press below the drag threshold only selects', () => {
        const spies = mount(1500)
        mouseDown(seg('m'))
        mouseMove(2)
        mouseUp()
        expect(activeUnit()).toBe('m')
        expect(spies.onChange).not.toHaveBeenCalled()
        expect(spies.onRelease).not.toHaveBeenCalled()
        expect(fieldRoot().classList.contains('is-dragging')).toBe(false)
    })

    it('realtime: announces at the threshold and releases once', () => {
        const spies = mount(1500, { realtime: true })
        mouseDown(seg('s'))
        mouseMove(3)
        expect(spies.onDragStart).not.toHaveBeenCalled()
        mouseMove(5)
        expect(spies.onDragStart).toHaveBeenCalledTimes(1)
        expect(fieldRoot().classList.contains('is-dragging')).toBe(true)
        mouseMove(12)
        mouseUp()
        expect(spies.onDragStart).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(6500)
        expect(fieldRoot().classList.contains('is-dragging')).toBe(false)
    })

    it('non-realtime: no announcement, still one release', () => {
        const spies = mount(1500)
        mouseDown(seg('s'))
        mouseMove(20)
        mouseUp()
        expect(spies.onDragStart).not.toHaveBeenCalled()
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
    })

    it.each([true, false])('losing pointer lock (Esc) abandons the drag, realtime=%s', (realtime) => {
        const spies = mount(1500, { realtime })
        mouseDown(seg('s'))
        mouseMove(20)
        expect(spies.onChange).toHaveBeenCalledWith(6500)
        act(() => {
            document.dispatchEvent(new Event('pointerlockchange'))
        })
        expect(spies.onDragCancel).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).not.toHaveBeenCalled()
        expect(spies.onDragStart).toHaveBeenCalledTimes(realtime ? 1 : 0)
        expect(fieldRoot().classList.contains('is-dragging')).toBe(false)
        expect(segsText()).toBe('0:01.500')
        // The gesture is over: a later mouseup must not release anything.
        mouseUp()
        expect(spies.onRelease).not.toHaveBeenCalled()
    })

    it('unmounting mid-drag cancels the run', () => {
        const spies = mount(1500, { realtime: true })
        mouseDown(seg('s'))
        mouseMove(20)
        act(() => root.unmount())
        expect(spies.onDragCancel).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).not.toHaveBeenCalled()
        root = createRoot(container) // afterEach unmounts a live root
    })

    it('restores the document text selection after a drag', () => {
        mount(1500)
        mouseDown(seg('s'))
        expect(document.body.style.userSelect).toBe('none')
        mouseMove(20)
        mouseUp()
        expect(document.body.style.userSelect).toBe('')
    })

    it('clamps at min and max while dragging', () => {
        const spies = mount(1500, { max: 3000 })
        mouseDown(seg('s'))
        mouseMove(40) // +10 s
        mouseUp()
        expect(spies.onRelease).toHaveBeenLastCalledWith(3000)
        mouseDown(seg('s'))
        mouseMove(-80)
        mouseUp()
        expect(spies.onRelease).toHaveBeenLastCalledWith(0)
    })
})

describe('TimeField stepper', () => {
    it('steps the active segment on press and releases once on mouseup', () => {
        const spies = mount(1500)
        const [up] = spinButtons()
        mouseDown(up)
        expect(segsText()).toBe('0:02.500')
        expect(spies.onDragStart).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).not.toHaveBeenCalled()
        mouseUp()
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(2500)
        expect(activeUnit()).toBe('s')
    })

    it('keeps the segment selected before the press', () => {
        mount(1500)
        const el = focusRoot()
        keyDown(el, 'ArrowLeft') // minutes
        const [up] = spinButtons()
        mouseDown(up)
        mouseUp()
        expect(segsText()).toBe('1:01.500')
        expect(activeUnit()).toBe('m')
    })

    it('auto-repeats while held and still releases once', () => {
        const spies = mount(1500)
        let delayCb: (() => void) | null = null
        let repeatCb: (() => void) | null = null
        vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => {
            delayCb = cb
            return 1 as unknown as ReturnType<typeof setTimeout>
        }) as typeof setTimeout)
        vi.spyOn(globalThis, 'setInterval').mockImplementation(((cb: () => void) => {
            repeatCb = cb
            return 2 as unknown as ReturnType<typeof setInterval>
        }) as typeof setInterval)
        const [up] = spinButtons()
        mouseDown(up)
        expect(delayCb).not.toBeNull()
        act(() => delayCb!())
        expect(repeatCb).not.toBeNull()
        act(() => repeatCb!())
        act(() => repeatCb!())
        expect(segsText()).toBe('0:04.500')
        mouseUp()
        expect(spies.onDragStart).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(4500)
    })

    it('Shift held at press time makes the whole press fine', () => {
        const spies = mount(1500)
        const [up] = spinButtons()
        mouseDown(up, { shiftKey: true })
        mouseUp()
        expect(spies.onRelease).toHaveBeenCalledWith(1600)
    })

    it('disables the down button at min and the up button at max', () => {
        mount(0, { max: 0 })
        const [up, down] = spinButtons()
        expect(down.disabled).toBe(true)
        expect(up.disabled).toBe(true)
    })

    it('unmounting mid-press cancels the run', () => {
        const spies = mount(1500)
        const [up] = spinButtons()
        mouseDown(up)
        act(() => root.unmount())
        expect(spies.onDragCancel).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).not.toHaveBeenCalled()
        root = createRoot(container)
    })

    it('a press while the editor is open steps from the typed draft', () => {
        const spies = mount(1500)
        const el = focusRoot()
        keyDown(el, 'Enter')
        setInputValue(editInput()!, '0:10.000')
        const [up] = spinButtons()
        mouseDown(up)
        mouseUp()
        expect(editInput()).toBeNull()
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(11000)
    })
})

describe('TimeField wheel', () => {
    it('Ctrl+wheel steps the hovered segment and is consumed', () => {
        const spies = mount(1500)
        const ev = wheel(seg('ms'), -100, { ctrlKey: true })
        expect(ev.defaultPrevented).toBe(true)
        expect(segsText()).toBe('0:01.501')
        expect(spies.onRelease).toHaveBeenCalledTimes(1)
        expect(spies.onRelease).toHaveBeenCalledWith(1501)
        expect(spies.onDragStart).not.toHaveBeenCalled()
        expect(activeUnit()).toBe('ms')

        wheel(seg('s'), 100, { metaKey: true, shiftKey: true }) // Cmd, fine
        expect(segsText()).toBe('0:01.401')
    })

    it('a plain wheel is left to the pane', () => {
        const spies = mount(1500)
        const ev = wheel(seg('s'), -100)
        expect(ev.defaultPrevented).toBe(false)
        expect(spies.onChange).not.toHaveBeenCalled()
    })
})

describe('TimeField disabled', () => {
    it('is not focusable and ignores every gesture', () => {
        const spies = mount(1500, { disabled: true })
        expect(fieldRoot().tabIndex).toBe(-1)
        expect(fieldRoot().classList.contains('is-disabled')).toBe(true)
        mouseDown(seg('m'))
        mouseMove(20)
        mouseUp()
        expect(activeUnit()).toBe('s')
        keyDown(fieldRoot(), 'ArrowUp')
        keyUp(fieldRoot(), 'ArrowUp')
        const ev = wheel(seg('s'), -100, { ctrlKey: true })
        expect(ev.defaultPrevented).toBe(false)
        const [up] = spinButtons()
        expect(up.disabled).toBe(true)
        expect(spies.onChange).not.toHaveBeenCalled()
        expect(spies.onRelease).not.toHaveBeenCalled()
    })
})
