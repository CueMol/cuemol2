import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'
import { mountTree, flushPromises } from './helpers/testHarness'

void React

function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
    )!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Degrade-detection tests for the ColorPicker widget wire contract.
 *
 * Pins:
 *   - on mount the canonical value is resolved through the `compileColor`
 *     service and the text box shows it
 *   - a valid text-box edit commits via `onChange(value, /*completed=*\/ true)`
 *   - an invalid edit (StyleManager rejects -> ok:false) does NOT commit and
 *     reverts the draft
 *   - the caret opens one popover whose segmented switch defaults to the
 *     RGB slider panel, and choosing the Palette segment swaps the body
 *   - `disabled` reaches the swatch as a modifier class (its CSS hook), not
 *     just the text box / caret
 *
 * Theme is mocked (the widget reads it only for the Blueprint dark portal
 * class); the worker `cm` is a stub whose `invokeService` returns canned
 * compileColor / getNamedColors results.
 */

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark' }),
}))

import { ColorPicker } from '../h3-kit/colorpicker/ColorPicker'

interface CmStub {
    invokeService: ReturnType<typeof vi.fn>
}

function makeCm(compileOk = true): CmStub {
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'compileColor') {
                return Promise.resolve(
                    compileOk
                        ? { ok: true, r: 0, g: 0, b: 255, hex: '#0000ff', className: 'Color', inGamut: true }
                        : { ok: false },
                )
            }
            return Promise.resolve({ scene: [], global: [] })
        }),
    }
}

describe('ColorPicker', () => {
    it('resolves the value via compileColor on mount', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <ColorPicker value="#0000FF" sceneId={3} cm={cm as never} onChange={vi.fn()} />,
        )
        await act(async () => {
            await flushPromises()
        })
        expect(cm.invokeService).toHaveBeenCalledWith('compileColor', {
            colorStr: '#0000FF',
            sceneId: 3,
        })
        const input = container.querySelector('input.bp5-input') as HTMLInputElement
        expect(input.value).toBe('#0000FF')
        unmount()
    })

    // The swatch is the part of the widget the eye lands on, so the disabled
    // state has to reach it too (the CSS hangs off this modifier class).
    it('marks the swatch disabled so the colour reads as inactive', async () => {
        const cm = makeCm()
        const off = mountTree(
            <ColorPicker value="#0000FF" sceneId={3} cm={cm as never} onChange={vi.fn()} />,
        )
        await act(async () => { await flushPromises() })
        expect(
            off.container.querySelector('.h3-color-swatch--disabled'),
        ).toBeNull()
        off.unmount()

        const on = mountTree(
            <ColorPicker value="#0000FF" sceneId={3} cm={cm as never} disabled onChange={vi.fn()} />,
        )
        await act(async () => { await flushPromises() })
        expect(
            on.container.querySelector('.h3-color-swatch--disabled'),
        ).not.toBeNull()
        on.unmount()
    })

    it('commits a valid text edit with completed=true', async () => {
        const cm = makeCm(true)
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <ColorPicker value="#0000FF" sceneId={0} cm={cm as never} onChange={onChange} />,
        )
        await act(async () => {
            await flushPromises()
        })
        const input = container.querySelector('input.bp5-input') as HTMLInputElement
        await act(async () => {
            setInputValue(input, 'red')
        })
        await act(async () => {
            input.dispatchEvent(new Event('focusout', { bubbles: true }))
            await flushPromises()
        })
        expect(onChange).toHaveBeenCalledWith('red', true)
        unmount()
    })

    it('does not commit an invalid text edit and reverts the draft', async () => {
        const cm = makeCm(false)
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <ColorPicker value="#0000FF" sceneId={0} cm={cm as never} onChange={onChange} />,
        )
        await act(async () => {
            await flushPromises()
        })
        const input = container.querySelector('input.bp5-input') as HTMLInputElement
        await act(async () => {
            setInputValue(input, 'garbage')
        })
        await act(async () => {
            input.dispatchEvent(new Event('focusout', { bubbles: true }))
            await flushPromises()
        })
        expect(onChange).not.toHaveBeenCalled()
        expect(input.value).toBe('#0000FF')
        unmount()
    })

    it('opens one popover defaulting to RGB sliders, and swaps body on segment switch', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <ColorPicker value="#0000FF" sceneId={0} cm={cm as never} onChange={vi.fn()} />,
        )
        await act(async () => {
            await flushPromises()
        })
        // Open the popover (caret button).
        const caret = container.querySelector('button.h3-color-caret-btn') as HTMLButtonElement
        await act(async () => {
            caret.click()
            await flushPromises()
        })
        // Default mode renders the RGB slider panel.
        expect(document.querySelector('.h3-color-slider-panel')).toBeTruthy()
        // The segmented switch offers all modes; clicking Palette swaps the body.
        const paletteSeg = Array.from(
            document.querySelectorAll('.h3-color-modebar button'),
        ).find((el) => el.textContent === 'Palette') as HTMLElement
        expect(paletteSeg).toBeTruthy()
        await act(async () => {
            paletteSeg.click()
            await flushPromises()
        })
        expect(document.querySelector('.h3-color-slider-panel')).toBeNull()
        expect(document.querySelector('.h3-color-palette')).toBeTruthy()
        unmount()
    })

    it('opens on the panel matching the value representation (hsb -> HSB)', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <ColorPicker value="hsb(240,1,0.5)" sceneId={0} cm={cm as never} onChange={vi.fn()} />,
        )
        await act(async () => {
            await flushPromises()
        })
        const caret = container.querySelector('button.h3-color-caret-btn') as HTMLButtonElement
        await act(async () => {
            caret.click()
            await flushPromises()
        })
        const active = document.querySelector('.h3-color-modebar button.bp5-active')
        expect(active?.textContent).toBe('HSB')
        unmount()
    })

    it('opens on the Named panel with the current named colour preselected (case-insensitive)', async () => {
        const cm = {
            invokeService: vi.fn((name: string) => {
                if (name === 'compileColor') {
                    return Promise.resolve({
                        ok: true, r: 224, g: 108, b: 117, hex: '#e06c75',
                        className: 'NamedColor', inGamut: true,
                    })
                }
                return Promise.resolve({
                    scene: [],
                    global: [
                        { name: 'red', hex: '#e06c75' },
                        { name: 'blue', hex: '#3b82f6' },
                    ],
                })
            }),
        }
        // jsdom does not implement scrollIntoView; stub it to assert the
        // selected entry is scrolled into view.
        const scrollSpy = vi.fn()
        ;(HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
            scrollSpy
        // Value casing ("RED") differs from the definition's ("red").
        const { container, unmount } = mountTree(
            <ColorPicker value="RED" sceneId={0} cm={cm as never} onChange={vi.fn()} />,
        )
        await act(async () => {
            await flushPromises()
        })
        const caret = container.querySelector('button.h3-color-caret-btn') as HTMLButtonElement
        await act(async () => {
            caret.click()
            await flushPromises()
        })
        // Named panel is shown...
        expect(document.querySelector('.h3-color-named-list')).toBeTruthy()
        // ...with the current entry preselected (so re-picking is a no-op),
        // matched case-insensitively.
        const selected = document.querySelectorAll('.h3-color-named-row--selected')
        expect(selected.length).toBe(1)
        expect(selected[0].textContent).toContain('red')
        // ...and scrolled into view (it can sit below the fold in the full list).
        expect(scrollSpy).toHaveBeenCalled()
        unmount()
    })

    it('restricts the segmented switch to the given `modes`', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <ColorPicker
                value="#0000FF"
                sceneId={0}
                cm={cm as never}
                onChange={vi.fn()}
                modes={['rgb', 'hsb', 'palette']}
            />,
        )
        await act(async () => {
            await flushPromises()
        })
        const caret = container.querySelector('button.h3-color-caret-btn') as HTMLButtonElement
        await act(async () => {
            caret.click()
            await flushPromises()
        })
        const labels = Array.from(
            document.querySelectorAll('.h3-color-modebar button'),
        ).map((el) => el.textContent)
        expect(labels).toEqual(['RGB', 'HSB', 'Palette'])
        expect(labels).not.toContain('Named')
        expect(labels).not.toContain('Mol')
        unmount()
    })

    it('applies $molcol immediately when the Mol segment is chosen', async () => {
        const cm = makeCm()
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <ColorPicker value="#0000FF" sceneId={0} cm={cm as never} onChange={onChange} />,
        )
        await act(async () => {
            await flushPromises()
        })
        const caret = container.querySelector('button.h3-color-caret-btn') as HTMLButtonElement
        await act(async () => {
            caret.click()
            await flushPromises()
        })
        const molSeg = Array.from(document.querySelectorAll('.h3-color-modebar button')).find(
            (el) => el.textContent === 'Mol',
        ) as HTMLElement
        await act(async () => {
            molSeg.click()
            await flushPromises()
        })
        expect(onChange).toHaveBeenCalledWith('$molcol', true)
        unmount()
    })
})
