/**
 * Tests for SelectionBuilder -- the operand builder + set-operation editor.
 *
 * The builder is controlled: the container owns the applied selection
 * (`current`, mirroring mol.sel) and the operand `draft`/`dispatch`. Every op
 * computes the resulting expression and hands it to `onApply`; there is no
 * builder-local current or undo. Tests wrap it in a `Harness` that owns
 * `current` (updated by onApply) so the two match real usage, and read the live
 * value from a `.cur` probe span.
 *
 * Pins:
 *  1. renders the Term + Modify sections
 *  2. Property keyword + value composes space-separated syntax and Replace
 *     makes it the current selection
 *  3. Add composes "(current) or (term)" from `current`
 *  4. a Modify op (Invert) transforms `current`
 *  5. the Named keyword shows a candidate dropdown; picking + Replace applies
 *     the named selection
 *  6. resolveValues is queried for keyword autocomplete
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { SelectionBuilder } from '../components/panes/selection/SelectionBuilder'
import type { SelectionBuilderProps } from '../components/panes/selection/SelectionBuilder'
import {
    builderReducer,
    initBuilderState,
} from '../components/panes/selection/selBuilderReducer'
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

function selectKeyword(container: HTMLElement, key: string): void {
    // The keyword dropdown is the first select in the Term row (the candidate
    // dropdown, when present, lives in .selbuilder-term-pick after it).
    setSelectValue(container.querySelector('.selbuilder-property select') as HTMLSelectElement, key)
}

function selectCandidate(container: HTMLElement, value: string): void {
    setSelectValue(container.querySelector('.selbuilder-term-pick select') as HTMLSelectElement, value)
}

function clickButtonByText(root: ParentNode, text: string): void {
    const btn = Array.from(root.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement
    btn.click()
}

describe('SelectionBuilder', () => {
    it('renders the Term and Modify sections', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        const heads = Array.from(container.querySelectorAll('.h3-form-field-section-title')).map((e) =>
            e.textContent?.trim(),
        )
        expect(heads).toEqual(['Term', 'Modify'])
        unmount()
    })

    it('composes space-separated syntax and Replace makes it current', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { clickButtonByText(container, 'Set') })
        await flushPromises()
        expect(current(container)).toBe("chain 'A'")
        unmount()
    })

    it('Add composes "(current) or (term)" from current', async () => {
        const { container, unmount } = mountTree(<Harness initial="chain 'X'" />)
        await flushPromises()
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { clickButtonByText(container, 'Add') })
        await flushPromises()
        expect(current(container)).toBe("(chain 'X') or (chain 'A')")
        unmount()
    })

    it('Invert transforms the current selection', async () => {
        const { container, unmount } = mountTree(<Harness initial="aname CB" />)
        await flushPromises()
        await act(async () => { clickButtonByText(container, 'Invert') })
        await flushPromises()
        expect(current(container)).toBe('not (aname CB)')
        unmount()
    })

    it('Named keyword: candidate dropdown pick + Replace applies the named selection', async () => {
        // Built-in macros (protein, water, ...) arrive as global defs.
        const { container, unmount } = mountTree(<Harness globalDefs={['protein']} />)
        await flushPromises()
        // Named is a keyword: selecting it swaps the value area for a candidate
        // dropdown, from which we pick 'protein'.
        await act(async () => { selectKeyword(container, 'named') })
        await flushPromises()
        await act(async () => { selectCandidate(container, 'protein') })
        await act(async () => { clickButtonByText(container, 'Set') })
        await flushPromises()
        expect(current(container)).toBe('protein')
        unmount()
    })

    it('queries resolveValues for keyword autocomplete', async () => {
        const resolveValues = vi.fn(async () => ['A', 'B'])
        const { container, unmount } = mountTree(<Harness resolveValues={resolveValues} />)
        await flushPromises()
        // chain has an autocomplete category; the default keyword (hier) does not.
        await act(async () => { selectKeyword(container, 'chain') })
        await flushPromises()
        expect(resolveValues).toHaveBeenCalledWith('chain')
        unmount()
    })
})
