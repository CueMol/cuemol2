/**
 * Tests for SelectionPane (Command-tab port of UXP panel.selection).
 *
 * Contract pinned here:
 *  1. molecule selector is populated from the ObjectSelect widget,
 *     which calls `listSceneObjects` and filters to MolCoord-like
 *  2. Select click invokes applyMolSelString with the active scene/mol
 *     and the current textarea value
 *  3. pushHistory fires only when the worker returns { ok: true }
 *  4. Clear button empties the textarea and disables itself
 *  5. History popover surfaces entries from getHistory and applies a
 *     chosen entry back into the textarea (no auto-Select)
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// SelectionPane embeds the SelectionBuilder, which reads the theme.
vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

const pushHistoryMock = vi.fn()
const getHistoryMock = vi.fn<() => string[]>(() => [])

vi.mock('../components/widgets/MolSelList/selHistory', () => ({
    pushHistory: (v: string) => pushHistoryMock(v),
    getHistory: () => getHistoryMock(),
    clearHistory: () => undefined,
    STORAGE_KEY: 'cuemol.molSelList.history',
    MAX_ENTRIES: 20,
}))

// Stub event listener subscription used by the ObjectSelect widget --
// we don't need to drive scene events from these tests.
vi.mock('../hooks/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

import { SelectionPane } from '../components/panes/SelectionPane'
import { mountTree, flushPromises } from './helpers/testHarness'

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

function makeCm(opts?: {
    mols?: Array<{ uid: number; name: string }>
    applyOk?: boolean
    validateOk?: boolean
}): MockCm {
    const mols = opts?.mols ?? [{ uid: 11, name: '1CRN' }]
    // ObjectSelect calls `listSceneObjects` and filters client-side
    // for MolCoord-like classes; we report `className: 'MolCoord'`
    // so the filter accepts each entry.
    const objects = mols.map((m) => ({ ...m, className: 'MolCoord' }))
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'listSceneObjects') return Promise.resolve({ objects })
            if (name === 'getMolChains') return Promise.resolve({ chains: [] })
            if (name === 'getSelDefs') return Promise.resolve({ scene: [], global: [] })
            if (name === 'applyMolSelString') {
                return Promise.resolve({ ok: opts?.applyOk ?? true })
            }
            if (name === 'validateSelection') {
                return Promise.resolve({ ok: opts?.validateOk ?? true })
            }
            return Promise.resolve(null)
        }),
    }
}

// The selection input is now a form-kit TextField (single-line input) inside
// the `.selection-input-field` Field, distinct from the builder's controls.
function getTextArea(container: HTMLElement): HTMLInputElement {
    return container.querySelector('.selection-input-field input') as HTMLInputElement
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

function findActionByTooltip(container: HTMLElement, tooltip: string): HTMLButtonElement | null {
    const buttons = Array.from(container.querySelectorAll('button.section-action-btn'))
    for (const btn of buttons) {
        const aria = btn.getAttribute('aria-label')
        if (aria === tooltip) return btn as HTMLButtonElement
    }
    // Tooltip is attached via parent; fall back to ordered position.
    return null
}

describe('SelectionPane', () => {
    beforeEach(() => {
        pushHistoryMock.mockReset()
        getHistoryMock.mockReset()
        getHistoryMock.mockReturnValue([])
    })

    afterEach(() => {
        // Nothing — each test uses its own mount/unmount.
    })

    it('populates the molecule selector from listSceneObjects', async () => {
        const cm = makeCm({ mols: [{ uid: 11, name: '1CRN' }, { uid: 22, name: '3J3Q' }] })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        // Scope to the molecule selector -- the inline builder also renders a
        // keyword <select>, so an unscoped `select option` query is ambiguous.
        const opts = Array.from(container.querySelectorAll('.object-select select option'))
        expect(opts.map((o) => o.textContent)).toEqual(['1CRN', '3J3Q'])
        expect(cm.invokeService).toHaveBeenCalledWith('listSceneObjects', { sceneId: 1 })
        unmount()
    })

    it('Select click invokes applyMolSelString with current sceneId/molId/selStr', async () => {
        const cm = makeCm({ applyOk: true })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getTextArea(container), 'aname CA') })
        await flushPromises()

        // Section-header action buttons are the only `.section-action-btn`s here.
        // Order in JSX: Select, Clear, History.
        const buttons = container.querySelectorAll<HTMLButtonElement>('button.section-action-btn')
        expect(buttons.length).toBeGreaterThanOrEqual(3)
        await act(async () => { buttons[0].click() })
        await flushPromises()

        expect(cm.invokeService).toHaveBeenCalledWith('applyMolSelString', {
            sceneId: 7,
            molId: 11,
            selStr: 'aname CA',
        })
        unmount()
    })

    it('appends to history only when applyMolSelString returns ok:true', async () => {
        const cm = makeCm({ applyOk: true })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getTextArea(container), 'aname CA') })
        await flushPromises()
        await act(async () => {
            container.querySelectorAll<HTMLButtonElement>('button.section-action-btn')[0].click()
        })
        await flushPromises()
        expect(pushHistoryMock).toHaveBeenCalledWith('aname CA')
        unmount()
    })

    it('does NOT append to history when applyMolSelString returns ok:false', async () => {
        const cm = makeCm({ applyOk: false })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getTextArea(container), 'bogus') })
        await flushPromises()
        await act(async () => {
            container.querySelectorAll<HTMLButtonElement>('button.section-action-btn')[0].click()
        })
        await flushPromises()
        expect(pushHistoryMock).not.toHaveBeenCalled()
        // Inline error message renders.
        expect(container.querySelector('.selection-error')?.textContent).toMatch(/invalid/i)
        unmount()
    })

    it('Clear button empties the textarea and disables itself when empty', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        const textarea = getTextArea(container)
        await act(async () => { setNativeValue(textarea, 'aname CA') })
        await flushPromises()
        const buttons = container.querySelectorAll<HTMLButtonElement>('button.section-action-btn')
        // Clear is the second action button in JSX order.
        expect(buttons[1].disabled).toBe(false)
        await act(async () => { buttons[1].click() })
        await flushPromises()
        expect(getTextArea(container).value).toBe('')
        expect(
            container.querySelectorAll<HTMLButtonElement>('button.section-action-btn')[1].disabled,
        ).toBe(true)
        unmount()
    })

    it('history popover lists getHistory entries and applies one into the textarea', async () => {
        getHistoryMock.mockReturnValue(['aname CA', 'chain.A'])
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        // History is the third action button. Click it to open the popover.
        const buttons = container.querySelectorAll<HTMLButtonElement>('button.section-action-btn')
        await act(async () => { buttons[2].click() })
        await flushPromises()
        // Popover content goes to document.body — query globally.
        const items = Array.from(document.querySelectorAll('.bp5-menu-item'))
        const labels = items.map((el) => el.textContent?.trim())
        expect(labels).toEqual(expect.arrayContaining(['aname CA', 'chain.A']))
        // Click the first entry.
        const first = items.find((el) => el.textContent?.trim() === 'aname CA') as HTMLElement
        await act(async () => { first.click() })
        await flushPromises()
        expect(getTextArea(container).value).toBe('aname CA')
        // Auto-Select must NOT have happened (UXP parity).
        expect(cm.invokeService).not.toHaveBeenCalledWith(
            'applyMolSelString',
            expect.anything(),
        )
        unmount()
    })

    it('disables Select when no molecule is available', async () => {
        const cm = makeCm({ mols: [] })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        const selectBtn = container.querySelectorAll<HTMLButtonElement>('button.section-action-btn')[0]
        expect(selectBtn.disabled).toBe(true)
        unmount()
    })
})
// silence unused warning if findActionByTooltip is not used in some build paths
void findActionByTooltip
