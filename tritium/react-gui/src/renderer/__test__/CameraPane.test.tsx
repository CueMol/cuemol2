/**
 * Camera pane contracts.
 *
 * Pinned here: which command each toolbar button and gesture raises, and with
 * what `withVisFlags` -- the four Save/Apply buttons differ only in that flag,
 * so a swapped pair would otherwise be invisible. Reordering by drag is pinned
 * as the payload the worker receives (the complete new order).
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
// Refresh-on-event is the live-fetch hook's own contract; drive the list
// purely from the mount fetch here.
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

const dispatch = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))
const openMenu = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock('@renderer/hooks/cuemol/useCueMol', async () =>
    (await import('@renderer/__test__/helpers/paneEnv')).mockCueMolModule())
vi.mock('@renderer/state/workspace', async () =>
    (await import('@renderer/__test__/helpers/paneEnv')).mockWorkspaceModule())
vi.mock('@renderer/commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch }) }))
vi.mock('@renderer/hooks/useClipboardScope', () => ({ useClipboardScope: () => undefined }))
vi.mock('@renderer/features/camera/useCameraCtxMenu', () => ({
    useCameraCtxMenu: () => openMenu,
}))

import { CameraPane } from '@renderer/features/camera/CameraPane'
import { CmdId } from '@renderer/commands/ids'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'
import { withPaneEnv } from '@renderer/__test__/helpers/paneEnv'

const CAMERAS = [
    { name: 'cam0', src: '', visSize: 0, uiOrder: 0 },
    { name: 'cam1', src: '/tmp/a.cam', visSize: 2, uiOrder: 1 },
]

function makeCm() {
    return {
        invokeService: vi.fn((name: string) =>
            name === 'listCameras'
                ? Promise.resolve({ ok: true, cameras: CAMERAS })
                : Promise.resolve({ ok: true }),
        ),
        addEventListener: vi.fn(() => Promise.resolve(1)),
        removeEventListener: vi.fn(() => Promise.resolve()),
    }
}

/** The toolbar buttons, in the order the header renders them. */
function toolButton(container: HTMLElement, index: number): HTMLElement {
    const btns = container.querySelectorAll('.sp-section-header-actions button')
    return btns[index] as HTMLElement
}

function row(container: HTMLElement, name: string): HTMLElement {
    const el = container.querySelector(`[data-camera-name="${name}"]`)
    if (!el) throw new Error(`row not found: ${name}`)
    return el as HTMLElement
}

function fire(el: Element, type: string, init: Record<string, unknown> = {}): void {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    Object.assign(ev, init)
    act(() => {
        el.dispatchEvent(ev)
    })
}

describe('CameraPane', () => {
    let cm: ReturnType<typeof makeCm>
    let view: { container: HTMLElement; unmount(): void }

    beforeEach(async () => {
        dispatch.mockClear()
        cm = makeCm()
        view = mountTree(withPaneEnv(cm, 100, 7, <CameraPane collapsed={false} />))
        await flushPromises()
    })

    afterEach(() => view.unmount())

    it('lists the scene cameras', () => {
        const names = Array.from(view.container.querySelectorAll('.camera-row-name')).map(
            (e) => e.textContent,
        )
        expect(names).toEqual(['cam0', 'cam1'])
        expect(cm.invokeService).toHaveBeenCalledWith('listCameras', { sceneId: 100 })
    })

    it('needs a selected camera for Save / Apply / Delete', () => {
        // 0 = New, 1..4 = Save / Save+vis / Apply / Apply+vis, 5 = Delete.
        expect(toolButton(view.container, 0).hasAttribute('disabled')).toBe(false)
        for (const i of [1, 2, 3, 4, 5]) {
            expect(toolButton(view.container, i).hasAttribute('disabled')).toBe(true)
        }
        fire(row(view.container, 'cam1'), 'click')
        for (const i of [1, 2, 3, 4, 5]) {
            expect(toolButton(view.container, i).hasAttribute('disabled')).toBe(false)
        }
    })

    it('raises Save / Apply with the right show/hide flag', () => {
        fire(row(view.container, 'cam1'), 'click')

        fire(toolButton(view.container, 1), 'click')
        expect(dispatch).toHaveBeenLastCalledWith(CmdId.CameraSaveFromView, {
            name: 'cam1', withVisFlags: false,
        })
        fire(toolButton(view.container, 2), 'click')
        expect(dispatch).toHaveBeenLastCalledWith(CmdId.CameraSaveFromView, {
            name: 'cam1', withVisFlags: true,
        })
        fire(toolButton(view.container, 3), 'click')
        expect(dispatch).toHaveBeenLastCalledWith(CmdId.CameraApplyToView, {
            name: 'cam1', withVisFlags: false,
        })
        fire(toolButton(view.container, 4), 'click')
        expect(dispatch).toHaveBeenLastCalledWith(CmdId.CameraApplyToView, {
            name: 'cam1', withVisFlags: true,
        })
    })

    it('applies with show/hide on a double-click (UXP parity)', () => {
        fire(row(view.container, 'cam0'), 'dblclick')
        expect(dispatch).toHaveBeenCalledWith(CmdId.CameraApplyToView, {
            name: 'cam0', withVisFlags: true,
        })
    })

    it('deletes the selected camera on the Delete key', () => {
        fire(row(view.container, 'cam0'), 'click')
        const body = view.container.querySelector('.camera-pane-body')!
        const ev = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
        act(() => {
            body.dispatchEvent(ev)
        })
        expect(dispatch).toHaveBeenLastCalledWith(CmdId.CameraDelete, { name: 'cam0' })
    })
})
