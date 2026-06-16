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
 *  5. Center click invokes centerMolSelection (and is disabled without a view)
 *
 * The action toolbar (Select / Center / Undo / Redo / Clear / Define) lives in
 * the embedded SelectionBuilder, directly under the selection field.
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

vi.mock('../h3-kit/MolSelList/selHistory', () => ({
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

// The action toolbar (Select / Center / Undo / Redo / Clear / Define) now lives
// in the SelectionBuilder, directly under the selection field. Find buttons by
// their stable aria-label / text rather than a header class.
function actionByAria(container: HTMLElement, aria: string): HTMLButtonElement {
    return container.querySelector(`button[aria-label="${aria}"]`) as HTMLButtonElement
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
    return Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text,
    ) as HTMLButtonElement
}

describe('SelectionPane', () => {
    beforeEach(() => {
        pushHistoryMock.mockReset()
        getHistoryMock.mockReset()
        getHistoryMock.mockReturnValue([])
    })

    afterEach(() => {
        // Nothing -- each test uses its own mount/unmount.
    })

    it('populates the molecule selector from listSceneObjects', async () => {
        const cm = makeCm({ mols: [{ uid: 11, name: '1CRN' }, { uid: 22, name: '3J3Q' }] })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        // Scope to the molecule selector -- the inline builder also renders a
        // keyword <select>, so an unscoped `select option` query is ambiguous.
        const opts = Array.from(container.querySelectorAll('.h3-object-select select option'))
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

        await act(async () => { actionByAria(container, 'Select atoms').click() })
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
        await act(async () => { actionByAria(container, 'Select atoms').click() })
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
        await act(async () => { actionByAria(container, 'Select atoms').click() })
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
        expect(buttonByText(container, 'Clear').disabled).toBe(false)
        await act(async () => { buttonByText(container, 'Clear').click() })
        await flushPromises()
        expect(getTextArea(container).value).toBe('')
        expect(buttonByText(container, 'Clear').disabled).toBe(true)
        unmount()
    })

    it('Center click invokes centerMolSelection when a view is active', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} activeMolViewId={5} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getTextArea(container), 'aname CA') })
        await flushPromises()
        await act(async () => { actionByAria(container, 'Center view on selection').click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('centerMolSelection', {
            sceneId: 7,
            viewId: 5,
            molId: 11,
            selStr: 'aname CA',
        })
        unmount()
    })

    it('disables Center when no active view is available', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        expect(actionByAria(container, 'Center view on selection').disabled).toBe(true)
        unmount()
    })

    it('disables Select when no molecule is available', async () => {
        const cm = makeCm({ mols: [] })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        expect(actionByAria(container, 'Select atoms').disabled).toBe(true)
        unmount()
    })
})
