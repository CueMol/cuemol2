/**
 * naviHover wire contract: the short status line per object type, a miss
 * for an empty / throwing hit test, and no side effects (no MsgLog, no undo).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'
import { naviHover } from '@renderer/worker/server/services/navi/naviTool'

describe('naviHover', () => {
    it('formats the headline per object type, reports misses, and has no side effects', () => {
        const hitTest = vi.fn()
        const view = fakeView({ uid: 7, extra: { hitTest } })
        const scene = fakeScene({ uid: 100, views: [view] })
        const { ctx } = makeWorkerCtx({ scenes: [scene] })

        hitTest.mockReturnValueOnce(JSON.stringify({
            objtype: 'MolCoord', obj_id: 3, obj_name: '1abc', rend_id: 10, rend_name: 's1',
            rendtype: '*symm', atom_id: 42, sel: 'aid 42', message: 'A ALA 10 CA',
            x: 0, y: 0, z: 0, occ: 1, bfac: 20, symm_id: 2, symm_name: 'x,y,z',
        }))
        const molHit = naviHover(ctx, { viewId: 7, x: 10, y: 20 })
        expect(hitTest).toHaveBeenLastCalledWith(10, 20)
        expect(molHit.hit).toBe(true)
        expect(molHit.message).toBe('Molecule [1abc], A ALA 10 CA (symop: x,y,z)')
        expect(molHit.raw?.atom_id).toBe(42)

        hitTest.mockReturnValueOnce(JSON.stringify({
            objtype: 'LWObject', obj_id: 4, obj_name: 'surf', rend_id: 11, rend_name: 'l1',
            rendtype: 'lwrend', atom_id: 0, sel: '', message: 'vertex 5',
            x: 0, y: 0, z: 0, occ: 0, bfac: 0,
        }))
        expect(naviHover(ctx, { viewId: 7, x: 1, y: 1 }).message).toBe('LWObject [surf], vertex 5')

        hitTest.mockReturnValueOnce('')
        expect(naviHover(ctx, { viewId: 7, x: 1, y: 1 })).toEqual({ hit: false })

        hitTest.mockImplementationOnce(() => { throw new Error('context lost') })
        expect(naviHover(ctx, { viewId: 7, x: 1, y: 1 })).toEqual({ hit: false })

        expect(naviHover(ctx, { viewId: 99, x: 1, y: 1 })).toEqual({ hit: false })

        // Read-only: no undo transaction was opened, no service (MsgLog) fetched.
        expect(scene.undo.started).toEqual([])
        expect(ctx.svc.getService).not.toHaveBeenCalled()
    })
})
