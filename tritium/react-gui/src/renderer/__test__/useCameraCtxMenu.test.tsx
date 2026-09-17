/**
 * @file __test__/useCameraCtxMenu.test.tsx
 * @description The Camera pane's right-click menu.
 *
 * Pinned: the payload identifies the row as a camera (with the metadata the
 * Reload / Clear-vis-flags gates read) or, on empty space, as the camera root;
 * a picked action becomes the matching command; and Rename opens the row
 * editor instead of dispatching anything.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { useCameraCtxMenu } from '@renderer/features/camera/useCameraCtxMenu'
import { CmdId } from '@renderer/commands/ids'
import { IPC } from '@shared/ipcChannels'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const dispatch = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@renderer/commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch }) }))
// These tests drive the darwin (native IPC) path; the React MenuPanel path is
// covered by contextMenuProvider.test.tsx.
vi.mock('@renderer/shell/menu/ContextMenuProvider', () => ({
    useShowContextMenu: () => vi.fn().mockResolvedValue(null),
}))

const CAM = { name: 'cam1', src: '/tmp/a.cam', visSize: 2, uiOrder: 1 }

function mountHook(onRename: (name: string) => void) {
    let result!: ReturnType<typeof useCameraCtxMenu>
    const container = document.createElement('div')
    document.body.appendChild(container)
    let root!: Root
    const Probe: React.FC = () => {
        result = useCameraCtxMenu({ onRename })
        return null
    }
    act(() => {
        root = createRoot(container)
        root.render(React.createElement(Probe))
    })
    return {
        get result() { return result },
        unmount() {
            act(() => { root.unmount() })
            document.body.removeChild(container)
        },
    }
}

/** Answer SCENE_CTX_SHOW with `action`, everything else with null. */
function menuReturns(action: unknown, onPayload?: (payload: any) => void) {
    const invoke = vi.fn((channel: string, payload: any) => {
        if (channel !== IPC.SCENE_CTX_SHOW) return Promise.resolve(null)
        onPayload?.(payload)
        return Promise.resolve(action)
    })
    ;(window as any).electronAPI = { platform: 'darwin', invoke }
    return invoke
}

beforeEach(() => dispatch.mockClear())
afterEach(() => { delete (window as any).electronAPI })

describe('useCameraCtxMenu', () => {
    it('sends a camera payload and dispatches the picked action', async () => {
        let payload: any
        menuReturns({ kind: 'cameraSaveFromView', withVisFlags: true }, (p) => { payload = p })
        const h = mountHook(vi.fn())
        await act(async () => { await h.result(CAM, 12, 34) })

        expect(payload).toMatchObject({
            x: 12, y: 34,
            nodeType: 'camera',
            nodeLabel: 'cam1',
            cameraInfo: { src: '/tmp/a.cam', visSize: 2 },
        })
        expect(dispatch).toHaveBeenCalledWith(CmdId.CameraSaveFromView, {
            name: 'cam1', withVisFlags: true,
        })
        h.unmount()
    })

    it('raises the root menu for empty space', async () => {
        let payload: any
        menuReturns({ kind: 'newCamera' }, (p) => { payload = p })
        const h = mountHook(vi.fn())
        await act(async () => { await h.result(null, 1, 2) })

        expect(payload).toMatchObject({ nodeType: 'cameraRoot', cameraInfo: undefined })
        expect(dispatch).toHaveBeenCalledWith(CmdId.CameraNew)
        h.unmount()
    })

    it('opens the row editor on Rename instead of dispatching', async () => {
        menuReturns({ kind: 'rename' })
        const onRename = vi.fn()
        const h = mountHook(onRename)
        await act(async () => { await h.result(CAM, 0, 0) })

        expect(onRename).toHaveBeenCalledWith('cam1')
        expect(dispatch).not.toHaveBeenCalled()
        h.unmount()
    })
})
