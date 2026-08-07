/**
 * Tests for SelectionBuilder -- the tabbed selection picker / composer.
 *
 * The builder is controlled: the container owns the applied selection
 * (`current`, mirroring mol.sel) and the operand `draft`/`dispatch`. Every op
 * computes the resulting expression and hands it to `onApply`; there is no
 * builder-local current or undo. Tests wrap it in a `Harness` that owns
 * `current` (updated by onApply) so the two match real usage, and read the live
 * value from a `.cur` probe span.
 *
 * Pins:
 *  1. renders the four tabs and opens on Named (the one-click path)
 *  2. a Named-tab click applies immediately through `onQuickApply`, bypassing
 *     `onApply`; without `onQuickApply` it falls back to `onApply`
 *  3. Term tab: property keyword + value composes space-separated syntax and
 *     Set makes it the current selection
 *  4. Term tab: Add composes "(current) or (term)" from `current`
 *  5. Term tab: the Named keyword remains available as a term source, so a
 *     named selection can be combined (not just replaced)
 *  6. Mod tab: a unary op (Invert) transforms `current`
 *  7. Term tab: Enter applies the term only while `current` is empty
 *  8. resolveValues is queried for keyword autocomplete
 *  9. the keyword dropdown lists the ready-made sources first
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { SelectionBuilder } from '../h3-kit/selection/SelectionBuilder'
import type { SelectionBuilderProps } from '../h3-kit/selection/SelectionBuilder'
import {
    builderReducer,
    initBuilderState,
} from '../h3-kit/selection/selBuilderReducer'
import { mountTree, flushPromises } from './helpers/testHarness'

type HarnessProps = Partial<
    Omit<SelectionBuilderProps, 'current' | 'draft' | 'dispatch' | 'onApply'>
> & { initial?: string }

/** Controlled wrapper: owns `current`, updated by the builder's onApply. */
const Harness: React.FC<HarnessProps> = ({ initial = '', ...builderProps }) => {
    const [current, setCurrent] = React.useState(initial)
    const [draft, dispatch] = React.useReducer(builderReducer, undefined, initBuilderState)
    return (
        <div>
            <SelectionBuilder
                current={current}
                draft={draft}
                dispatch={dispatch}
                onApply={setCurrent}
                {...builderProps}
            />
            <span className="cur">{current}</span>
        </div>
    )
}

function current(container: HTMLElement): string {
    return container.querySelector('.cur')!.textContent!.trim()
}

function termValueInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('.selbuilder-term-form input.bp5-input') as HTMLInputElement
}

function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Tab labels of the segmented control, in order. */
function tabLabels(container: HTMLElement): (string | undefined)[] {
    return Array.from(container.querySelectorAll('.h3-form-segmented button')).map((b) =>
        b.textContent?.trim(),
    )
}

/** Switch to a tab by its label (Named / History / Term / Mod). */
function selectTab(container: HTMLElement, label: string): void {
    const btn = Array.from(container.querySelectorAll('.h3-form-segmented button')).find(
        (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement
    btn.click()
}

function selectKeyword(container: HTMLElement, key: string): void {
    // The keyword dropdown is the first select in the Term row (the candidate
    // dropdown, when present, lives in .selbuilder-term-pick after it).
    setSelectValue(container.querySelector('.selbuilder-property select') as HTMLSelectElement, key)
}

function selectCandidate(container: HTMLElement, value: string): void {
    setSelectValue(container.querySelector('.selbuilder-term-pick select') as HTMLSelectElement, value)
}

/** Click a menu item (Named / History tab) by its text. */
function quickItem(container: HTMLElement, text: string): HTMLElement | undefined {
    return Array.from(container.querySelectorAll('.selbuilder-menu .bp5-menu-item')).find(
        (el) => el.textContent?.trim() === text,
    ) as HTMLElement | undefined
}

/** Click an op button by its label span (ignoring the hit-count badge). */
function clickOp(container: HTMLElement, label: string): void {
    const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.querySelector('.selbuilder-op-label')?.textContent?.trim() === label,
    ) as HTMLButtonElement
    btn.click()
}

function pressEnter(input: HTMLInputElement): void {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

describe('SelectionBuilder', () => {
    it('renders the four tabs and opens on Named', async () => {
        const { container, unmount } = mountTree(<Harness globalDefs={['protein']} />)
        await flushPromises()
        expect(tabLabels(container)).toEqual(['Named', 'History', 'Term', 'Mod'])
        // The Named menu is the visible panel; the composer is not mounted.
        expect(quickItem(container, 'protein')).toBeTruthy()
        expect(container.querySelector('.selbuilder-property')).toBeNull()
        unmount()
    })

    it('Named tab: a click applies immediately via onQuickApply, bypassing onApply', async () => {
        const onQuickApply = vi.fn()
        const { container, unmount } = mountTree(
            <Harness globalDefs={['protein']} onQuickApply={onQuickApply} />,
        )
        await flushPromises()
        await act(async () => { quickItem(container, 'protein')!.click() })
        await flushPromises()
        expect(onQuickApply).toHaveBeenCalledTimes(1)
        expect(onQuickApply).toHaveBeenCalledWith('protein')
        // onApply (the Harness setter) is untouched -- the host commits instead.
        expect(current(container)).toBe('')
        unmount()
    })

    it('Named tab: falls back to onApply when no onQuickApply is given, replacing current', async () => {
        const { container, unmount } = mountTree(
            <Harness initial="chain 'X'" globalDefs={['protein']} />,
        )
        await flushPromises()
        await act(async () => { quickItem(container, 'protein')!.click() })
        await flushPromises()
        // A quick pick always replaces -- combining goes through the Term tab.
        expect(current(container)).toBe('protein')
        unmount()
    })

    it('Term tab: composes space-separated syntax and Set makes it current', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        await act(async () => { selectTab(container, 'Term') })
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { clickOp(container, 'Set') })
        await flushPromises()
        expect(current(container)).toBe("chain 'A'")
        unmount()
    })

    it('Term tab: Add composes "(current) or (term)" from current', async () => {
        const { container, unmount } = mountTree(<Harness initial="chain 'X'" />)
        await flushPromises()
        await act(async () => { selectTab(container, 'Term') })
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { clickOp(container, 'Add') })
        await flushPromises()
        expect(current(container)).toBe("(chain 'X') or (chain 'A')")
        unmount()
    })

    it('Term tab: the Named keyword stays available so a named selection can be combined', async () => {
        // Built-in macros (protein, water, ...) arrive as global defs.
        const { container, unmount } = mountTree(
            <Harness initial="chain 'X'" globalDefs={['protein']} />,
        )
        await flushPromises()
        await act(async () => { selectTab(container, 'Term') })
        await act(async () => { selectKeyword(container, 'named') })
        await flushPromises()
        await act(async () => { selectCandidate(container, 'protein') })
        await act(async () => { clickOp(container, 'Add') })
        await flushPromises()
        expect(current(container)).toBe("(chain 'X') or (protein)")
        unmount()
    })

    it('Mod tab: Invert transforms the current selection', async () => {
        const { container, unmount } = mountTree(<Harness initial="aname CB" />)
        await flushPromises()
        await act(async () => { selectTab(container, 'Mod') })
        await act(async () => { clickOp(container, 'Invert') })
        await flushPromises()
        expect(current(container)).toBe('not (aname CB)')
        unmount()
    })

    it('Term tab: Enter applies the term only while current is empty', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        await act(async () => { selectTab(container, 'Term') })
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { pressEnter(termValueInput(container)) })
        await flushPromises()
        expect(current(container)).toBe("chain 'A'")
        // Now current is non-empty: Enter must not silently replace it.
        await act(async () => { setInputValue(termValueInput(container), 'B') })
        await act(async () => { pressEnter(termValueInput(container)) })
        await flushPromises()
        expect(current(container)).toBe("chain 'A'")
        unmount()
    })

    it('queries resolveValues for keyword autocomplete', async () => {
        const resolveValues = vi.fn(async () => ['A', 'B'])
        const { container, unmount } = mountTree(<Harness resolveValues={resolveValues} />)
        await flushPromises()
        await act(async () => { selectTab(container, 'Term') })
        // chain has an autocomplete category; the default keyword (hier) does not.
        await act(async () => { selectKeyword(container, 'chain') })
        await flushPromises()
        expect(resolveValues).toHaveBeenCalledWith('chain')
        unmount()
    })

    it('lists the ready-made sources first in the keyword dropdown', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        await act(async () => { selectTab(container, 'Term') })
        const values = Array.from(
            container.querySelectorAll('.selbuilder-property select option'),
        ).map((o) => (o as HTMLOptionElement).value)
        expect(values.slice(0, 2)).toEqual(['named', 'history'])
        unmount()
    })
})
