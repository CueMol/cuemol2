/**
 * Tests for SelectionBuilder (current-selection + set-operation model).
 *
 * Pins the observable contract:
 *  1. the trigger renders; clicking it opens the four-block popover
 *  2. Property keyword + value composes SPACE-separated syntax (chain 'A')
 *     and "Set" makes it the current selection
 *  3. the current expression is mirrored to the parent via onEmit in real time
 *  4. "Add" composes "(current) or (term)" seeded from the value prop
 *  5. Named source pick + Set applies the global named selection
 *  6. resolveValues feeds a datalist for autocomplete
 *  7. "Define name..." calls onSaveAs with (name, current)
 *
 * The popover renders in a portal on document.body, so content is queried
 * from `document`, not the mount container.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

import { SelectionBuilder } from '../components/widgets/MolSelList/SelectionBuilder'
import { mountTree, flushPromises } from './helpers/testHarness'

function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

function trigger(container: HTMLElement): HTMLButtonElement {
    return container.querySelector('button[aria-label="Build selection"]') as HTMLButtonElement
}

async function openPopover(container: HTMLElement): Promise<void> {
    await act(async () => {
        trigger(container).click()
    })
    await flushPromises()
}

function popover(): HTMLElement {
    return document.querySelector('.selbuilder-popover') as HTMLElement
}

function clickButtonByText(root: ParentNode, text: string): void {
    const btn = Array.from(root.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement
    btn.click()
}

/** Let the Blueprint popover open/close transition settle before unmount. */
async function settle(): Promise<void> {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 350))
    })
}

/** Close the popover (no Apply button -- toggle via the trigger) and settle. */
async function closePopover(container: HTMLElement): Promise<void> {
    await act(async () => { trigger(container).click() })
    await flushPromises()
    await settle()
}

function currentText(): string {
    return popover().querySelector('.selbuilder-current code')!.textContent!.trim()
}

function termValueInput(): HTMLInputElement {
    return popover().querySelector('.selbuilder-term-form input.bp5-input') as HTMLInputElement
}

describe('SelectionBuilder', () => {
    it('opens the four-block popover on trigger click', async () => {
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} />,
        )
        await openPopover(container)
        const heads = Array.from(popover().querySelectorAll('.selbuilder-block-head')).map((e) =>
            e.textContent?.trim(),
        )
        expect(heads).toEqual(['Current selection', 'Term', 'Apply term'])
        await closePopover(container)
        unmount()
    })

    it('composes space-separated syntax and Set makes it current', async () => {
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} />,
        )
        await openPopover(container)
        await act(async () => { setInputValue(termValueInput(), 'A') })
        clickButtonByText(popover(), 'Set')
        await flushPromises()
        expect(currentText()).toBe("chain 'A'")
        await closePopover(container)
        unmount()
    })

    it('syncs the current expression to the parent in real time', async () => {
        const onEmit = vi.fn()
        const { container, unmount } = mountTree(<SelectionBuilder value="" onEmit={onEmit} />)
        await openPopover(container)
        await act(async () => { setInputValue(termValueInput(), 'A') })
        clickButtonByText(popover(), 'Set')
        await flushPromises()
        expect(onEmit).toHaveBeenLastCalledWith("chain 'A'")
        await closePopover(container)
        unmount()
    })

    it('Add composes "(current) or (term)" seeded from value', async () => {
        const onEmit = vi.fn()
        const { container, unmount } = mountTree(
            <SelectionBuilder value="chain 'X'" onEmit={onEmit} />,
        )
        await openPopover(container)
        await act(async () => { setInputValue(termValueInput(), 'A') })
        clickButtonByText(popover(), 'Add')
        await flushPromises()
        expect(currentText()).toBe("(chain 'X') or (chain 'A')")
        expect(onEmit).toHaveBeenLastCalledWith("(chain 'X') or (chain 'A')")
        await closePopover(container)
        unmount()
    })

    it('Named source: picking a global named selection and Set applies its name', async () => {
        // Built-in macros (protein, water, ...) arrive here as global defs
        // loaded from default_style.xml; there is no hardcoded macro list.
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} globalDefs={['protein']} />,
        )
        await openPopover(container)
        await act(async () => { clickButtonByText(popover(), 'Named') })
        await flushPromises()
        const protein = Array.from(popover().querySelectorAll('.bp5-menu-item')).find(
            (e) => e.textContent?.trim() === 'protein',
        ) as HTMLElement
        await act(async () => { protein.click() })
        await act(async () => { clickButtonByText(popover(), 'Set') })
        await flushPromises()
        expect(currentText()).toBe('protein')
        await closePopover(container)
        unmount()
    })

    it('resolveValues feeds a datalist for autocomplete', async () => {
        const resolveValues = vi.fn(async () => ['A', 'B'])
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} resolveValues={resolveValues} />,
        )
        await openPopover(container)
        await flushPromises()
        const opts = Array.from(document.querySelectorAll('#selbuilder-value-list option')).map(
            (o) => (o as HTMLOptionElement).value,
        )
        expect(opts).toEqual(['A', 'B'])
        expect(resolveValues).toHaveBeenCalledWith('chain')
        await closePopover(container)
        unmount()
    })

    it('Define name... calls onSaveAs with (name, current)', async () => {
        const onSaveAs = vi.fn(async () => true)
        const { container, unmount } = mountTree(
            <SelectionBuilder value="chain 'A'" onEmit={() => undefined} onSaveAs={onSaveAs} />,
        )
        await openPopover(container)
        clickButtonByText(popover(), 'Define name...')
        await flushPromises()
        const nameInput = popover().querySelector(
            '.selbuilder-saverow input.bp5-input',
        ) as HTMLInputElement
        await act(async () => { setInputValue(nameInput, 'mysel') })
        clickButtonByText(popover(), 'Define')
        await flushPromises()
        expect(onSaveAs).toHaveBeenCalledWith('mysel', "chain 'A'")
        await closePopover(container)
        unmount()
    })

    it('Step back (undo) reverts the last operation', async () => {
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} />,
        )
        await openPopover(container)
        await act(async () => { setInputValue(termValueInput(), 'A') })
        clickButtonByText(popover(), 'Set')
        await flushPromises()
        // Apply Mainchain by mistake, then step back.
        clickButtonByText(popover(), 'Mainchain')
        await flushPromises()
        expect(currentText()).toBe("bymainch (chain 'A')")
        const undo = popover().querySelector('button[aria-label="Step back"]') as HTMLButtonElement
        await act(async () => { undo.click() })
        await flushPromises()
        expect(currentText()).toBe("chain 'A'")
        await closePopover(container)
        unmount()
    })
})
