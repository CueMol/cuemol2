import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/camera/camera.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

interface FakeCam {
    name: string
    src?: string
    visSize?: number
    uiOrder: number
}

/**
 * A scene whose getCameraInfoJSON reports the cameras in ui_order, the way
 * `Scene::getCameraInfoJSON` does after sorting by slot.
 */
function buildCtx(cams: FakeCam[]) {
    const state = cams.map((c) => ({ ...c }))
    const orderWrites: { name: string; order: number }[] = []
    const startUndoTxn = vi.fn()
    const commitUndoTxn = vi.fn()
    const rollbackUndoTxn = vi.fn()

    const getCameraInfoJSON = vi.fn(() =>
        JSON.stringify(
            [...state]
                .sort((a, b) => a.uiOrder - b.uiOrder)
                .map((c) => ({
                    name: c.name,
                    ui_order: c.uiOrder,
                    vis_size: c.visSize ?? 0,
                    src: c.src ?? '',
                })),
        ),
    )
    // getCamera returns a COPY, as in C++; setCamera writes it back.
    const getCamera = vi.fn((name: string) => {
        const found = state.find((c) => c.name === name)
        if (!found) return null
        const copy = { name, ui_order: found.uiOrder }
        return copy
    })
    const setCamera = vi.fn((name: string, cam: { ui_order: number }) => {
        const found = state.find((c) => c.name === name)
        if (found) found.uiOrder = cam.ui_order
        orderWrites.push({ name, order: cam.ui_order })
    })

    const scene = {
        startUndoTxn, commitUndoTxn, rollbackUndoTxn,
        getCameraInfoJSON, getCamera, setCamera,
    }
    const ctx = { sceMgr: { getScene: vi.fn(() => scene) } } as unknown as WorkerContext
    return { ctx, orderWrites, setCamera, startUndoTxn, commitUndoTxn }
}

describe('cameraOrder.listCameras', () => {
    // `__current` is listed as UXP listed it, but pinned to the top whatever
    // slot it happens to hold: it is where the scene opens, not one of the
    // viewpoints the user arranges.
    it('lists every camera in scene order, with __current pinned to the top', () => {
        const { ctx } = buildCtx([
            { name: 'zulu', uiOrder: 0, src: '/tmp/z.cam' },
            { name: '__current', uiOrder: 1 },
            { name: 'alpha', uiOrder: 2, visSize: 3 },
        ])
        const res = services.listCameras(ctx, { sceneId: 1 })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.cameras.map((c) => c.name)).toEqual(['__current', 'zulu', 'alpha'])
        expect(res.cameras[1].src).toBe('/tmp/z.cam')
        expect(res.cameras[2].visSize).toBe(3)
    })
})

describe('cameraOrder.reorderCameras', () => {
    it('leaves the pinned __current out of the ordering', () => {
        const { ctx, orderWrites } = buildCtx([
            { name: '__current', uiOrder: 0 },
            { name: 'a', uiOrder: 1 },
            { name: 'b', uiOrder: 2 },
        ])
        // What the pane sends starts with the pinned row. The slots written are
        // the other cameras', numbered from zero -- so `b` takes slot 0, which
        // `__current` would hold if it were part of the ordering, and `a` is
        // left alone because slot 1 is where it already sits.
        const res = services.reorderCameras(ctx, { sceneId: 1, names: ['__current', 'b', 'a'] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.names).toEqual(['__current', 'b', 'a'])
        expect(orderWrites).toEqual([{ name: 'b', order: 0 }])
    })

    it('writes one slot per moved camera in a single undo txn', () => {
        const { ctx, orderWrites, startUndoTxn, commitUndoTxn } = buildCtx([
            { name: 'a', uiOrder: 0 },
            { name: 'b', uiOrder: 1 },
            { name: 'c', uiOrder: 2 },
        ])
        const res = services.reorderCameras(ctx, { sceneId: 1, names: ['b', 'a', 'c'] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.changed).toBe(true)
        expect(res.names).toEqual(['b', 'a', 'c'])
        expect(startUndoTxn).toHaveBeenCalledWith('Reorder cameras')
        expect(commitUndoTxn).toHaveBeenCalledTimes(1)
        // 'c' keeps slot 2, so it is not rewritten.
        expect(orderWrites).toEqual([
            { name: 'b', order: 0 },
            { name: 'a', order: 1 },
        ])
    })

    it('opens no transaction when the order is unchanged', () => {
        const { ctx, setCamera, startUndoTxn } = buildCtx([
            { name: 'a', uiOrder: 0 },
            { name: 'b', uiOrder: 1 },
        ])
        const res = services.reorderCameras(ctx, { sceneId: 1, names: ['a', 'b'] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.changed).toBe(false)
        expect(startUndoTxn).not.toHaveBeenCalled()
        expect(setCamera).not.toHaveBeenCalled()
    })

    it('drops stale names and keeps cameras the caller omitted', () => {
        const { ctx } = buildCtx([
            { name: 'a', uiOrder: 0 },
            { name: 'b', uiOrder: 1 },
            { name: 'c', uiOrder: 2 },
        ])
        const res = services.reorderCameras(ctx, { sceneId: 1, names: ['c', 'gone'] })
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.names).toEqual(['c', 'a', 'b'])
    })
})
