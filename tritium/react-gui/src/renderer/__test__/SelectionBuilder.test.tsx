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
 *  5. Named source: full variant shows an inline listbox; picking + Replace
 *     applies the named selection
 *  6. resolveValues is queried for keyword autocomplete
 *  7. compact variant uses a popover picker (not an inline listbox)
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

function selectKeyword(container: HTMLElement, key: string): void {
    const select = container.querySelector('.selbuilder-property select') as HTMLSelectElement
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, key)
    select.dispatchEvent(new Event('change', { bubbles: true }))
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
        await act(async () => { clickButtonByText(container, 'Replace') })
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

    it('Named source (full): inline listbox pick + Replace applies the named selection', async () => {
        // Built-in macros (protein, water, ...) arrive as global defs.
        const { container, unmount } = mountTree(<Harness globalDefs={['protein']} />)
        await flushPromises()
        // Switching to Named expands an inline listbox directly (no popover).
        await act(async () => { clickButtonByText(container, 'Named') })
        await flushPromises()
        const row = Array.from(container.querySelectorAll('.h3-list-row')).find(
            (e) => e.textContent?.trim() === 'protein',
        ) as HTMLElement
        await act(async () => { row.click() })
        await flushPromises()
        await act(async () => { clickButtonByText(container, 'Replace') })
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

    it('compact variant uses a popover picker for Named (no inline listbox)', async () => {
        const { container, unmount } = mountTree(
            <Harness variant="compact" globalDefs={['protein']} />,
        )
        await flushPromises()
        await act(async () => { clickButtonByText(container, 'Named') })
        await flushPromises()
        // The compact source is a popover trigger, not an inline list row.
        const trigger = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Select named...',
        )
        expect(trigger).toBeTruthy()
        expect(container.querySelector('.selbuilder-sourcelist')).toBeNull()
        unmount()
    })
})
