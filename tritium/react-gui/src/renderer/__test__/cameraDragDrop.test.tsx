/**
 * Reordering the camera rows by drag.
 *
 * Pinned: the worker is told the COMPLETE new order (it stores a slot per
 * camera, so a partial list would leave the rest where they were), and a drop
 * that changes nothing raises no command at all.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))
vi.mock('@renderer/hooks/cuemol/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

const dispatch = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))
vi.mock('@renderer/hooks/cuemol/useCueMol', async () =>
    (await import('@renderer/__test__/helpers/paneEnv')).mockCueMolModule())
vi.mock('@renderer/state/workspace', async () =>
    (await import('@renderer/__test__/helpers/paneEnv')).mockWorkspaceModule())
vi.mock('@renderer/commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch }) }))
vi.mock('@renderer/hooks/useClipboardScope', () => ({ useClipboardScope: () => undefined }))
vi.mock('@renderer/features/camera/useCameraCtxMenu', () => ({
    useCameraCtxMenu: () => vi.fn(() => Promise.resolve()),
}))

import { CameraPane } from '@renderer/features/camera/CameraPane'
import { CmdId } from '@renderer/commands/ids'
import { mountTree, flushPromises } from '@renderer/__test__/helpers/testHarness'
import { withPaneEnv } from '@renderer/__test__/helpers/paneEnv'

// The pane lists `__current` first and pins it there.
const CAMERAS = ['__current', 'cam0', 'cam1', 'cam2'].map((name, i) => ({
    name, src: '', visSize: 0, uiOrder: i,
}))

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

function makeDataTransfer() {
    const store: Record<string, string> = {}
    return {
        setData: (k: string, v: string) => {
            store[k] = v
        },
        getData: (k: string) => store[k] ?? '',
        get types() {
            return Object.keys(store)
        },
        // The pane names the row as the drag image; jsdom has no DataTransfer
        // of its own, so the stub has to carry the method.
        setDragImage: () => undefined,
        effectAllowed: '',
        dropEffect: '',
    }
}

function fireDrag(
    el: Element,
    type: string,
    dt: ReturnType<typeof makeDataTransfer>,
    clientY = 0,
): void {
    const ev = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(ev, 'dataTransfer', { value: dt })
    Object.defineProperty(ev, 'clientY', { value: clientY })
    act(() => {
        el.dispatchEvent(ev)
    })
}

describe('Camera pane drag-and-drop reorder', () => {
    let view: { container: HTMLElement; unmount(): void }

    beforeEach(async () => {
        dispatch.mockClear()
        view = mountTree(withPaneEnv(makeCm(), 100, 7, <CameraPane collapsed={false} />))
        await flushPromises()
    })

    afterEach(() => view.unmount())

    const row = (name: string) =>
        view.container.querySelector(`[data-camera-name="${name}"]`)!

    it('sends the complete new order when a row is dropped', () => {
        const dt = makeDataTransfer()
        fireDrag(row('cam0'), 'dragstart', dt)
        // jsdom reports an all-zero rect, so clientY > 0 lands in the lower
        // half -> drop AFTER the target row.
        fireDrag(row('cam2'), 'dragover', dt, 10)
        expect(view.container.querySelector('.is-drop-after')).toBeTruthy()
        fireDrag(row('cam2'), 'drop', dt, 10)

        expect(dispatch).toHaveBeenCalledWith(CmdId.CameraReorder, {
            names: ['__current', 'cam1', 'cam2', 'cam0'],
        })
    })

    it('does nothing when the drop would not move the row', () => {
        const dt = makeDataTransfer()
        fireDrag(row('cam1'), 'dragstart', dt)
        // Dropping below cam0 is where cam1 already is.
        fireDrag(row('cam0'), 'dragover', dt, 10)
        fireDrag(row('cam0'), 'drop', dt, 10)
        expect(dispatch).not.toHaveBeenCalled()
    })

    // Dropping past the last row is how a list is reordered to the end
    // everywhere else; refusing it would leave the bottom reachable only by
    // hitting the lower half of the last row.
    it('moves the row to the end when dropped on the empty space below', () => {
        const body = view.container.querySelector('.camera-pane-body')!
        const dt = makeDataTransfer()
        fireDrag(row('cam0'), 'dragstart', dt)
        fireDrag(body, 'dragover', dt, 400)
        // The indicator sits under the last row, which is where it will land.
        expect(row('cam2').className).toContain('is-drop-after')
        fireDrag(body, 'drop', dt, 400)

        expect(dispatch).toHaveBeenCalledWith(CmdId.CameraReorder, {
            names: ['__current', 'cam1', 'cam2', 'cam0'],
        })
    })

    it('does nothing when the row dropped below is already last', () => {
        const body = view.container.querySelector('.camera-pane-body')!
        const dt = makeDataTransfer()
        fireDrag(row('cam2'), 'dragstart', dt)
        fireDrag(body, 'dragover', dt, 400)
        fireDrag(body, 'drop', dt, 400)
        expect(dispatch).not.toHaveBeenCalled()
    })

    // `__current` is where the scene opens, so it keeps the top: it cannot be
    // picked up, and a row dropped on it lands below it rather than above.
    it('keeps the pinned __current row at the top', () => {
        expect(row('__current').getAttribute('draggable')).toBe('false')
        expect(row('cam0').getAttribute('draggable')).toBe('true')

        const dt = makeDataTransfer()
        fireDrag(row('cam2'), 'dragstart', dt)
        // Upper half of the pinned row would mean "above it".
        fireDrag(row('__current'), 'dragover', dt, -10)
        expect(view.container.querySelector('.is-drop-before')).toBeNull()
        fireDrag(row('__current'), 'drop', dt, -10)
        expect(dispatch).toHaveBeenCalledWith(CmdId.CameraReorder, {
            names: ['__current', 'cam2', 'cam0', 'cam1'],
        })
    })
})
