/**
 * Pin the getViewTabLabel worker service: resolves a view -> its scene and
 * composes the tab label as `<scene name>:<view name>` (UXP makeTabLabel),
 * and reports ok:false when the view or scene is gone.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import { services } from '../worker/server/services/getViewTabLabel.service'

const { getViewTabLabel } = services

function makeCtx(view: unknown): WorkerContext {
    return { sceMgr: { getView: vi.fn(() => view) } } as unknown as WorkerContext
}

describe('getViewTabLabel service', () => {
    it('composes `<scene name>:<view name>` and reports the scene uid', () => {
        const scene = { name: 'MyScene', uid: 42 }
        const view = { name: '0', getScene: () => scene }
        const res = getViewTabLabel(makeCtx(view), { viewId: 10 })
        expect(res).toEqual({ ok: true, title: 'MyScene:0', sceneId: 42 })
    })

    it('returns ok:false when the view is missing', () => {
        const res = getViewTabLabel(makeCtx(null), { viewId: 10 })
        expect(res).toEqual({ ok: false, title: '', sceneId: -1 })
    })

    it('returns ok:false when the scene is missing', () => {
        const view = { name: '0', getScene: () => null }
        const res = getViewTabLabel(makeCtx(view), { viewId: 10 })
        expect(res).toEqual({ ok: false, title: '', sceneId: -1 })
    })
})
