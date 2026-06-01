/**
 * Tests for SelectionBuilder -- inline current-selection + set-operation editor.
 *
 * Pins the observable contract:
 *  1. renders the three blocks inline (no popover trigger)
 *  2. Property keyword + value composes SPACE-separated syntax (chain 'A')
 *     and "Set" makes it the current selection
 *  3. the current expression is mirrored to the parent via onEmit in real time
 *  4. "Add" composes "(current) or (term)" seeded from the value prop
 *  5. an external `value` change re-seeds the builder's current selection
 *  6. Step back (undo) survives the emit/re-seed round-trip
 *  7. Named source pick + Set applies the global named selection
 *  8. resolveValues feeds a datalist for autocomplete
 *  9. "Define name..." calls onSaveAs with (name, current)
 *
 * The builder is a controlled editor: it emits `state.current` through onEmit
 * and re-seeds from `value`. Tests wrap it in a `Harness` that owns the value
 * state so the two-way sync mirrors real usage, and read the live value from a
 * `.cur` probe span.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { SelectionBuilder } from '../components/widgets/MolSelList/SelectionBuilder'
import type { SelectionBuilderProps } from '../components/widgets/MolSelList/SelectionBuilder'
import { mountTree, flushPromises } from './helpers/testHarness'

type HarnessProps = Partial<Omit<SelectionBuilderProps, 'value' | 'onEmit'>> & { initial?: string }

/** Controlled wrapper: owns the value, mirrors the two-way builder sync. */
const Harness: React.FC<HarnessProps> = ({ initial = '', ...builderProps }) => {
    const [val, setVal] = React.useState(initial)
    return (
        <div>
            <button className="ext-set" onClick={() => setVal('aname CB')}>
                ext
            </button>
            <SelectionBuilder value={val} onEmit={setVal} {...builderProps} />
            <span className="cur">{val}</span>
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

/**
 * Select a Property keyword from the builder's keyword dropdown. The default
 * keyword is `hierarchical`, so tests that exercise a single-value keyword
 * (e.g. chain) switch to it explicitly to stay independent of the default.
 */
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
    it('renders the three blocks inline', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        const heads = Array.from(container.querySelectorAll('.fk-field-section-title')).map((e) =>
            e.textContent?.trim(),
        )
        // The action toolbar has no header (the selection text field is the
        // current selection). Term (binary ops) and Modify (unary ops) are the
        // two sibling FieldSections (Term first); Apply is nested under Term.
        expect(heads).toEqual(['Term', 'Modify'])
        unmount()
    })

    it('composes space-separated syntax and Set makes it current', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { clickButtonByText(container, 'Set') })
        await flushPromises()
        expect(current(container)).toBe("chain 'A'")
        unmount()
    })

    it('Add composes "(current) or (term)" seeded from value', async () => {
        const { container, unmount } = mountTree(<Harness initial="chain 'X'" />)
        await flushPromises()
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { clickButtonByText(container, 'Add') })
        await flushPromises()
        expect(current(container)).toBe("(chain 'X') or (chain 'A')")
        unmount()
    })

    it('re-seeds the current selection from an external value change', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        // Parent changes the value out from under the builder.
        await act(async () => {
            (container.querySelector('.ext-set') as HTMLButtonElement).click()
        })
        await flushPromises()
        expect(current(container)).toBe('aname CB')
        // The new value really seeded the reducer: a unary op builds on it.
        await act(async () => { clickButtonByText(container, 'Not') })
        await flushPromises()
        expect(current(container)).toBe('not (aname CB)')
        unmount()
    })

    it('Step back (undo) survives the emit round-trip', async () => {
        const { container, unmount } = mountTree(<Harness />)
        await flushPromises()
        await act(async () => { selectKeyword(container, 'chain') })
        await act(async () => { setInputValue(termValueInput(container), 'A') })
        await act(async () => { clickButtonByText(container, 'Set') })
        await flushPromises()
        // Apply Mainchain by mistake, then step back.
        await act(async () => { clickButtonByText(container, 'Mainch') })
        await flushPromises()
        expect(current(container)).toBe("bymainch (chain 'A')")
        const undo = container.querySelector('button[aria-label="Step back"]') as HTMLButtonElement
        await act(async () => { undo.click() })
        await flushPromises()
        expect(current(container)).toBe("chain 'A'")
        unmount()
    })

    it('Named source: picking a global named selection and Set applies its name', async () => {
        // Built-in macros (protein, water, ...) arrive here as global defs
        // loaded from default_style.xml; there is no hardcoded macro list.
        const { container, unmount } = mountTree(<Harness globalDefs={['protein']} />)
        await flushPromises()
        // Switch the term source to Named, then open the picker popover (the
        // list renders in a portal so a long list never pushes Apply down).
        await act(async () => { clickButtonByText(container, 'Named') })
        await act(async () => { clickButtonByText(container, 'Select named...') })
        await flushPromises()
        const protein = Array.from(document.querySelectorAll('.bp5-menu-item')).find(
            (e) => e.textContent?.trim() === 'protein',
        ) as HTMLElement
        await act(async () => { protein.click() })
        await flushPromises()
        await act(async () => { clickButtonByText(container, 'Set') })
        await flushPromises()
        expect(current(container)).toBe('protein')
        unmount()
    })

    it('resolveValues feeds a datalist for autocomplete', async () => {
        const resolveValues = vi.fn(async () => ['A', 'B'])
        const { container, unmount } = mountTree(<Harness resolveValues={resolveValues} />)
        await flushPromises()
        // chain has an autocomplete category; the default keyword (hier) does not.
        await act(async () => { selectKeyword(container, 'chain') })
        await flushPromises()
        const opts = Array.from(container.querySelectorAll('#selbuilder-value-list option')).map(
            (o) => (o as HTMLOptionElement).value,
        )
        expect(opts).toEqual(['A', 'B'])
        expect(resolveValues).toHaveBeenCalledWith('chain')
        unmount()
    })

    it('Define name... calls onSaveAs with (name, current)', async () => {
        const onSaveAs = vi.fn(async () => true)
        const { container, unmount } = mountTree(
            <Harness initial="chain 'A'" onSaveAs={onSaveAs} />,
        )
        await flushPromises()
        await act(async () => { clickButtonByText(container, 'Define name...') })
        await flushPromises()
        const nameInput = container.querySelector(
            '.selbuilder-saverow input.bp5-input',
        ) as HTMLInputElement
        await act(async () => { setInputValue(nameInput, 'mysel') })
        await act(async () => { clickButtonByText(container, 'Define') })
        await flushPromises()
        expect(onSaveAs).toHaveBeenCalledWith('mysel', "chain 'A'")
        unmount()
    })
})
