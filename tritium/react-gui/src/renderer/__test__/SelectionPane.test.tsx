/**
 * Tests for SelectionPane (Command-tab port of UXP panel.selection).
 *
 * Contract pinned here:
 *  1. molecule selector is populated from ObjectSelect (listSceneObjects)
 *  2. Apply (arrow) invokes applyMolSelString with the active scene/mol and the
 *     text-field value; the arrow is enabled only when the field diverges from
 *     mol.sel (an update is pending)
 *  3. pushHistory fires only when the worker returns { ok: true }
 *  4. Clear empties the field, clears mol.sel, and disables itself
 *  5. Center invokes centerMolSelection on the applied selection (disabled
 *     without a view)
 *  6. UI state persists across unmount/remount (pane switch) but resets on a
 *     scene change
 *
 * The current selection reflects mol.sel: the mock tracks the applied string
 * and returns it as getSelDefs.currentSel, so the field mirrors mol.sel and the
 * arrow disables after applying.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

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

// The mol.sel-change event listener is not driven from these tests.
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

import { SelectionPane } from '../components/panes/SelectionPane'
import { clearSnapshot } from '../components/panes/selection/selectionPaneStore'
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
    const objects = mols.map((m) => ({ ...m, className: 'MolCoord' }))
    // Track the applied selection so getSelDefs reflects mol.sel (the SoT).
    let applied = ''
    return {
        invokeService: vi.fn((name: string, args?: { selStr?: string }) => {
            if (name === 'listSceneObjects') return Promise.resolve({ objects })
            if (name === 'getMolChains') return Promise.resolve({ chains: [] })
            if (name === 'getSelDefs') {
                return Promise.resolve({ scene: [], global: [], currentSel: applied || undefined })
            }
            if (name === 'applyMolSelString') {
                const ok = opts?.applyOk ?? true
                if (ok) applied = args?.selStr ?? ''
                return Promise.resolve({ ok })
            }
            if (name === 'validateSelection') return Promise.resolve({ ok: opts?.validateOk ?? true })
            if (name === 'getSelHitCount') return Promise.resolve({ count: null })
            if (name === 'centerMolSelection') return Promise.resolve({ ok: true })
            return Promise.resolve(null)
        }),
    }
}

function getInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('.selection-input-field input') as HTMLInputElement
}

function setNativeValue(el: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

function actionByAria(container: HTMLElement, aria: string): HTMLButtonElement {
    return container.querySelector(`button[aria-label="${aria}"]`) as HTMLButtonElement
}

describe('SelectionPane', () => {
    beforeEach(() => {
        pushHistoryMock.mockReset()
        getHistoryMock.mockReset()
        getHistoryMock.mockReturnValue([])
        clearSnapshot()
    })

    it('populates the molecule selector from listSceneObjects', async () => {
        const cm = makeCm({ mols: [{ uid: 11, name: '1CRN' }, { uid: 22, name: '3J3Q' }] })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        const opts = Array.from(container.querySelectorAll('.h3-object-select select option'))
        expect(opts.map((o) => o.textContent)).toEqual(['1CRN', '3J3Q'])
        expect(cm.invokeService).toHaveBeenCalledWith('listSceneObjects', { sceneId: 1 })
        unmount()
    })

    it('Apply invokes applyMolSelString with current sceneId/molId/selStr', async () => {
        const cm = makeCm({ applyOk: true })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getInput(container), 'aname CA') })
        await flushPromises()
        await act(async () => { actionByAria(container, 'Apply selection').click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('applyMolSelString', {
            sceneId: 7,
            molId: 11,
            selStr: 'aname CA',
        })
        unmount()
    })

    it('the Apply arrow enables only when the field diverges from mol.sel', async () => {
        const cm = makeCm({ applyOk: true })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} />,
        )
        await flushPromises()
        // Empty field == empty mol.sel -> nothing to apply.
        expect(actionByAria(container, 'Apply selection').disabled).toBe(true)
        await act(async () => { setNativeValue(getInput(container), 'aname CA') })
        await flushPromises()
        expect(actionByAria(container, 'Apply selection').disabled).toBe(false)
        // After applying, the field mirrors mol.sel -> arrow disables again.
        await act(async () => { actionByAria(container, 'Apply selection').click() })
        await flushPromises()
        expect(actionByAria(container, 'Apply selection').disabled).toBe(true)
        // Editing re-enables it.
        await act(async () => { setNativeValue(getInput(container), 'aname CB') })
        await flushPromises()
        expect(actionByAria(container, 'Apply selection').disabled).toBe(false)
        unmount()
    })

    it('appends to history only when applyMolSelString returns ok:true', async () => {
        const cm = makeCm({ applyOk: true })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getInput(container), 'aname CA') })
        await flushPromises()
        await act(async () => { actionByAria(container, 'Apply selection').click() })
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
        await act(async () => { setNativeValue(getInput(container), 'bogus') })
        await flushPromises()
        await act(async () => { actionByAria(container, 'Apply selection').click() })
        await flushPromises()
        expect(pushHistoryMock).not.toHaveBeenCalled()
        expect(container.querySelector('.selection-error')?.textContent).toMatch(/invalid/i)
        unmount()
    })

    it('Clear empties the field, clears mol.sel, and disables itself', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getInput(container), 'aname CA') })
        await flushPromises()
        expect(actionByAria(container, 'Clear selection').disabled).toBe(false)
        await act(async () => { actionByAria(container, 'Clear selection').click() })
        await flushPromises()
        expect(getInput(container).value).toBe('')
        expect(actionByAria(container, 'Clear selection').disabled).toBe(true)
        unmount()
    })

    it('Center invokes centerMolSelection on the applied selection', async () => {
        const cm = makeCm()
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={7} activeMolViewId={5} />,
        )
        await flushPromises()
        await act(async () => { setNativeValue(getInput(container), 'aname CA') })
        await flushPromises()
        // Apply so mol.sel (and thus the Center target) is set.
        await act(async () => { actionByAria(container, 'Apply selection').click() })
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

    it('disables Apply when no molecule is available', async () => {
        const cm = makeCm({ mols: [] })
        const { container, unmount } = mountTree(
            <SelectionPane cm={cm as never} activeSceneId={1} />,
        )
        await flushPromises()
        expect(actionByAria(container, 'Apply selection').disabled).toBe(true)
        unmount()
    })

    it('persists the field across unmount/remount but resets on a scene change', async () => {
        const cm = makeCm()
        const first = mountTree(<SelectionPane cm={cm as never} activeSceneId={5} />)
        await flushPromises()
        await act(async () => { setNativeValue(getInput(first.container), 'chain A') })
        await flushPromises()
        first.unmount()

        // Remount on the same scene -> the pending field survives the switch.
        const same = mountTree(<SelectionPane cm={cm as never} activeSceneId={5} />)
        await flushPromises()
        expect(getInput(same.container).value).toBe('chain A')
        same.unmount()

        // Remount on a different scene -> reset.
        const other = mountTree(<SelectionPane cm={cm as never} activeSceneId={9} />)
        await flushPromises()
        expect(getInput(other.container).value).toBe('')
        other.unmount()
    })
})
