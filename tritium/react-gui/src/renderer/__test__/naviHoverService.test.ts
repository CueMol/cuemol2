/**
 * naviHover wire contract: the structured label per object / renderer type,
 * a miss for an empty or throwing hit test, and no side effects (no MsgLog,
 * no undo).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import { fakeObject, fakeScene, fakeView, makeWorkerCtx } from '@renderer/worker/testing'
import { naviHover } from '@renderer/worker/server/services/navi/naviTool'

const MOL_HIT = {
    objtype: 'MolCoord', obj_id: 3, obj_name: '1CRN', rend_id: 10, rend_name: 'cartoon1',
    rendtype: 'cartoon', atom_id: 42, sel: 'A.10.*', message: 'A ALA 10 CA',
    x: 0, y: 0, z: 0, occ: 1, bfac: 20,
}

describe('naviHover', () => {
    it('labels residue-level and atom-level hits, non-molecule hits, and misses', () => {
        const hitTest = vi.fn()
        const atom = { chainName: 'A', residName: 'ALA', residIndex: '10', name: 'CA' }
        const mol = fakeObject({ uid: 3, className: 'MolCoord', extra: { getAtomByID: vi.fn(() => atom) } })
        const scene = fakeScene({ uid: 100, objects: [mol] })
        const view = fakeView({ uid: 7, scene, extra: { hitTest } })
        scene.views.push(view)
        const { ctx } = makeWorkerCtx({ scenes: [scene] })

        // cartoon: residue level -> no atom name
        hitTest.mockReturnValueOnce(JSON.stringify(MOL_HIT))
        const res = naviHover(ctx, { viewId: 7, x: 10, y: 20 })
        expect(hitTest).toHaveBeenLastCalledWith(10, 20)
        expect(res.hit).toBe(true)
        expect(res.label).toEqual({
            objName: '1CRN', rendName: 'cartoon1', rendType: 'cartoon', residueLevel: true,
            chain: 'A', resName: 'ALA', resIndex: '10',
        })

        // simple + symm: atom level with the atom name and the symop
        hitTest.mockReturnValueOnce(JSON.stringify({
            ...MOL_HIT, rend_name: 'symm1', rendtype: '*symm', symm_id: 2, symm_name: 'x,y,z',
        }))
        expect(naviHover(ctx, { viewId: 7, x: 1, y: 1 }).label).toEqual({
            objName: '1CRN', rendName: 'symm1', rendType: '*symm', residueLevel: false,
            chain: 'A', resName: 'ALA', resIndex: '10', atomName: 'CA', symop: 'x,y,z',
        })

        // non-molecule object: text only
        hitTest.mockReturnValueOnce(JSON.stringify({
            objtype: 'LWObject', obj_id: 4, obj_name: 'surf', rend_id: 11, rend_name: 'l1',
            rendtype: 'lwrend', atom_id: 0, sel: '', message: 'vertex 5', x: 0, y: 0, z: 0, occ: 0, bfac: 0,
        }))
        expect(naviHover(ctx, { viewId: 7, x: 1, y: 1 }).label).toEqual({
            objName: 'surf', rendName: 'l1', rendType: 'lwrend', residueLevel: false, text: 'vertex 5',
        })

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
