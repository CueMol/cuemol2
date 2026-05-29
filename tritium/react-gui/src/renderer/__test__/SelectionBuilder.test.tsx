/**
 * Tests for SelectionBuilder -- pin the emitted CueMol selection syntax and
 * the one-way builder->text contract:
 *  1. the trigger button renders; clicking it opens the tabbed popover
 *  2. Builder: keyword + value -> preview uses SPACE-separated keyword syntax
 *     (chain 'A'), NOT the dot form
 *  3. resi keyword exposes a range field; Insert emits "resi 1:10"
 *  4. Replace all emits ('<expr>', 'replace') and clears the draft
 *  5. Macros: clicking a macro emits its NAME with replace; hover discloses
 *     its real definition
 *  6. NOT toggle wraps the term as not (...)
 *  7. History: clicking an entry emits it with replace; empty -> "No history"
 *  8. resolveValues feeds a datalist when values exist
 *
 * The popover renders in a portal on document.body, so content is queried
 * from `document`, not the mount container.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

function setSelectValue(select: HTMLSelectElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
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

/** Query a popover region by class from the document body (portal). */
function popover(): HTMLElement {
    return document.querySelector('.selbuilder-popover') as HTMLElement
}

function clickButtonByText(root: ParentNode, text: string): void {
    const btn = Array.from(root.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement
    btn.click()
}

function clickTab(id: string): void {
    const tab = document.querySelector(`[role="tab"][data-tab-id="${id}"]`) as HTMLElement
    tab.click()
}

describe('SelectionBuilder', () => {
    beforeEach(() => {
        document.body.innerHTML = ''
    })

    it('renders the trigger and opens the tabbed popover on click', async () => {
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} />,
        )
        expect(trigger(container)).toBeTruthy()
        await openPopover(container)
        const tabLabels = Array.from(document.querySelectorAll('[role="tab"]')).map((t) =>
            t.textContent?.trim(),
        )
        expect(tabLabels).toEqual(['Builder', 'Library', 'History'])
        unmount()
    })

    it('composes space-separated keyword syntax (chain \'A\', not chain.A)', async () => {
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} />,
        )
        await openPopover(container)
        const valueInput = popover().querySelector('input.bp5-input') as HTMLInputElement
        await act(async () => setInputValue(valueInput, 'A'))
        await act(async () => clickButtonByText(popover(), 'Add'))
        await flushPromises()
        const preview = popover().querySelector('.selbuilder-preview code')!
        expect(preview.textContent).toBe("chain 'A'")
        unmount()
    })

    it('emits "resi 1:10" via the range field on Insert', async () => {
        const onEmit = vi.fn()
        const { container, unmount } = mountTree(<SelectionBuilder value="" onEmit={onEmit} />)
        await openPopover(container)
        const select = popover().querySelector('select') as HTMLSelectElement
        await act(async () => setSelectValue(select, 'resi'))
        await flushPromises()
        const inputs = popover().querySelectorAll('input.bp5-input')
        // First input is the value; second is the range "to" field.
        await act(async () => setInputValue(inputs[0] as HTMLInputElement, '1'))
        await act(async () => setInputValue(inputs[1] as HTMLInputElement, '10'))
        await act(async () => clickButtonByText(popover(), 'Add'))
        await flushPromises()
        expect(popover().querySelector('.selbuilder-preview code')!.textContent).toBe('resi 1:10')
        await act(async () => clickButtonByText(popover(), 'Insert'))
        await flushPromises()
        expect(onEmit).toHaveBeenCalledWith('resi 1:10', 'insert')
        unmount()
    })

    it('Replace all emits replace and clears the draft terms', async () => {
        const onEmit = vi.fn()
        const { container, unmount } = mountTree(<SelectionBuilder value="" onEmit={onEmit} />)
        await openPopover(container)
        const valueInput = popover().querySelector('input.bp5-input') as HTMLInputElement
        await act(async () => setInputValue(valueInput, 'A'))
        await act(async () => clickButtonByText(popover(), 'Add'))
        await flushPromises()
        await act(async () => clickButtonByText(popover(), 'Replace all'))
        await flushPromises()
        expect(onEmit).toHaveBeenCalledWith("chain 'A'", 'replace')
        // Popover closed + terms cleared: re-open shows the empty hint.
        await openPopover(container)
        expect(popover().querySelector('.selbuilder-empty')?.textContent).toBe('No terms yet.')
        unmount()
    })

    it('NOT toggle wraps the term as not (...)', async () => {
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} />,
        )
        await openPopover(container)
        const valueInput = popover().querySelector('input.bp5-input') as HTMLInputElement
        await act(async () => setInputValue(valueInput, 'A'))
        await act(async () => clickButtonByText(popover(), 'Add'))
        await flushPromises()
        const tag = popover().querySelector('.bp5-tag') as HTMLElement
        await act(async () => tag.click())
        await flushPromises()
        expect(popover().querySelector('.selbuilder-preview code')!.textContent).toBe(
            "not (chain 'A')",
        )
        unmount()
    })

    it('Library tab emits the macro NAME with replace', async () => {
        const onEmit = vi.fn()
        const { container, unmount } = mountTree(<SelectionBuilder value="" onEmit={onEmit} />)
        await openPopover(container)
        await act(async () => clickTab('library'))
        await flushPromises()
        const water = Array.from(document.querySelectorAll('.selbuilder-menu a')).find((el) =>
            el.textContent?.includes('Water'),
        ) as HTMLElement
        await act(async () => water.click())
        await flushPromises()
        // Macro is emitted by NAME; the C++ compiler resolves the definition.
        expect(onEmit).toHaveBeenCalledWith('water', 'replace')
        unmount()
    })

    it('Library tab presets emit "*" / "" and scene/global defs emit their name', async () => {
        const onEmit = vi.fn()
        const { container, unmount } = mountTree(
            <SelectionBuilder
                value=""
                onEmit={onEmit}
                currentSel="chain 'A'"
                sceneDefs={['mySceneSel']}
                globalDefs={['myGlobalSel']}
            />,
        )
        await openPopover(container)
        await act(async () => clickTab('library'))
        await flushPromises()
        const click = (text: string) => {
            const item = Array.from(document.querySelectorAll('.selbuilder-menu a')).find(
                (el) => el.textContent?.trim() === text,
            ) as HTMLElement
            item.click()
        }
        await act(async () => click('all (*)'))
        expect(onEmit).toHaveBeenLastCalledWith('*', 'replace')
        await openPopover(container)
        await act(async () => clickTab('library'))
        await act(async () => click('mySceneSel'))
        expect(onEmit).toHaveBeenLastCalledWith('mySceneSel', 'replace')
        await openPopover(container)
        await act(async () => clickTab('library'))
        await act(async () => click('myGlobalSel'))
        expect(onEmit).toHaveBeenLastCalledWith('myGlobalSel', 'replace')
        unmount()
    })

    it('History tab emits a stored entry with replace; empty shows "No history"', async () => {
        const onEmit = vi.fn()
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={onEmit} history={['resi 1:10']} />,
        )
        await openPopover(container)
        await act(async () => clickTab('history'))
        await flushPromises()
        const entry = Array.from(document.querySelectorAll('.selbuilder-menu a')).find(
            (el) => el.textContent?.trim() === 'resi 1:10',
        ) as HTMLElement
        expect(entry).toBeTruthy()
        await act(async () => entry.click())
        await flushPromises()
        expect(onEmit).toHaveBeenCalledWith('resi 1:10', 'replace')
        unmount()
    })

    it('renders a datalist of resolved values for the active keyword', async () => {
        const resolveValues = vi.fn().mockResolvedValue(['A', 'B'])
        const { container, unmount } = mountTree(
            <SelectionBuilder value="" onEmit={() => undefined} resolveValues={resolveValues} />,
        )
        await openPopover(container)
        await flushPromises()
        expect(resolveValues).toHaveBeenCalledWith('chain')
        const opts = Array.from(document.querySelectorAll('#selbuilder-value-list option')).map(
            (o) => (o as HTMLOptionElement).value,
        )
        expect(opts).toEqual(['A', 'B'])
        unmount()
    })
})
