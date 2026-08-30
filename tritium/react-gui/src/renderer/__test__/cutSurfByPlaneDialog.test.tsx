/**
 * CutSurfByPlaneDialog commit-wire contract (degrade-detection for T13
 * DialogShell + useMolEditCommit extraction).
 *
 * Pins the OBSERVABLE confirm path, not the JSX:
 *   - OK calls invokeService('cutSurfByPlane', { sceneId, viewId, objId, mode,
 *     density }) with the fields the dialog built.
 *   - On {ok:true} it resolves onConfirm({ ok: true }).
 *   - On {ok:false} it surfaces the error (.h3-dialog-error) and does NOT call
 *     onConfirm({ok:true}).
 *   - Reset-on-open clears mode/density/errorMsg but the surface id is
 *     intentionally NOT reset (last-picked persists). This test only pins the
 *     transient resets; objId persistence is asserted indirectly (OK fires
 *     again after a hide/reshow without re-picking).
 *
 * objId is populated by the embedded ObjectSelect auto-selecting the first
 * matching scene object once listSceneObjects resolves.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/contexts/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}))

const invokeService = vi.fn()
const mockCm = {
    invokeService,
    addEventListener: vi.fn().mockResolvedValue(1),
    removeEventListener: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
    useCueMol: () => ({ cueMolReady: true, cm: mockCm }),
}))

import { CutSurfByPlaneDialog } from '@renderer/dialogs/CutSurfByPlaneDialog'
import type { CutSurfByPlaneDialogResult } from '@renderer/dialogs/CutSurfByPlaneDialog'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'

const SURF = { uid: 42, name: 'surf1', className: 'MolSurfObj' }

/**
 * Route invokeService by name: the embedded ObjectSelect needs a MolSurfObj so
 * it auto-selects objId; the commit returns a configurable result.
 */
function routeInvoke(commit: () => unknown): void {
    invokeService.mockImplementation((name: string) => {
        if (name === 'listSceneObjects') return Promise.resolve({ objects: [SURF] })
        if (name === 'cutSurfByPlane') return Promise.resolve(commit())
        return Promise.resolve(undefined)
    })
}

function okButton(): HTMLButtonElement {
    return Array.from(document.body.querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === 'OK',
    ) as HTMLButtonElement
}

function commitCalls(): unknown[][] {
    return invokeService.mock.calls.filter((c) => c[0] === 'cutSurfByPlane')
}

function mount(visible = true) {
    let captured: CutSurfByPlaneDialogResult | null = null
    const handle = mountTree(
        React.createElement(CutSurfByPlaneDialog, {
            visible,
            sceneId: 7,
            viewId: 3,
            onConfirm: (r: CutSurfByPlaneDialogResult) => { captured = r },
            onCancel: () => {},
        }),
    )
    return { ...handle, get captured() { return captured } }
}

beforeEach(() => {
    invokeService.mockReset()
})
afterEach(() => {
    document.body.innerHTML = ''
})

describe('CutSurfByPlaneDialog commit wire', () => {
    it('OK fires cutSurfByPlane with the field payload and resolves onConfirm', async () => {
        routeInvoke(() => ({ ok: true }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(commitCalls()[0][1]).toEqual({
            sceneId: 7,
            viewId: 3,
            objId: 42,
            mode: 'full',
            density: 5.0,
        })
        expect(handle.captured).toEqual({ ok: true })
        handle.unmount()
    })

    it('on {ok:false} surfaces the error and does NOT resolve success', async () => {
        routeInvoke(() => ({ ok: false, error: 'boom' }))
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(commitCalls()).toHaveLength(1)
        expect(handle.captured).toBeNull()
        const err = document.body.querySelector('.h3-dialog-error')
        expect(err?.textContent).toBe('boom')
        handle.unmount()
    })

    it('a thrown commit surfaces String(err) without resolving success', async () => {
        invokeService.mockImplementation((name: string) => {
            if (name === 'listSceneObjects') return Promise.resolve({ objects: [SURF] })
            if (name === 'cutSurfByPlane') return Promise.reject(new Error('xx'))
            return Promise.resolve(undefined)
        })
        const handle = mount()
        await flushPromises()

        await act(async () => { okButton().click() })
        await flushPromises()

        expect(handle.captured).toBeNull()
        expect(document.body.querySelector('.h3-dialog-error')?.textContent)
            .toContain('xx')
        handle.unmount()
    })

    it('reset-on-open clears the error but the surface id persists', async () => {
        // First open: fail to set an error message.
        routeInvoke(() => ({ ok: false, error: 'boom' }))
        const handle = mount(true)
        await flushPromises()
        await act(async () => { okButton().click() })
        await flushPromises()
        expect(document.body.querySelector('.h3-dialog-error')).toBeTruthy()

        // Hide then reshow: error clears, objId stays (commit still carries 42
        // without re-picking) and OK succeeds.
        routeInvoke(() => ({ ok: true }))
        act(() => {
            handle.root.render(
                React.createElement(CutSurfByPlaneDialog, {
                    visible: false, sceneId: 7, viewId: 3,
                    onConfirm: () => {}, onCancel: () => {},
                }),
            )
        })
        await flushPromises()
        let captured: CutSurfByPlaneDialogResult | null = null
        act(() => {
            handle.root.render(
                React.createElement(CutSurfByPlaneDialog, {
                    visible: true, sceneId: 7, viewId: 3,
                    onConfirm: (r: CutSurfByPlaneDialogResult) => { captured = r },
                    onCancel: () => {},
                }),
            )
        })
        await flushPromises()
        expect(document.body.querySelector('.h3-dialog-error')).toBeNull()

        await act(async () => { okButton().click() })
        await flushPromises()
        const last = commitCalls()[commitCalls().length - 1][1] as Record<string, unknown>
        expect(last.objId).toBe(42)
        expect(captured).toEqual({ ok: true })
        handle.unmount()
    })
})
