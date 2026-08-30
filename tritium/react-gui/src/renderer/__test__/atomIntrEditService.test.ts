/**
 * Degrade-detection tests for `atomIntrEdit` (worker service backing the
 * "Edit interaction list" dialog, UXP `tools/aintr-edit-dlg`).
 *
 * Pins the wire contract:
 *   - listAtomIntrDefs parses `getDefsJSON` into {id, mode, atoms[]} (2 atoms
 *     for distance, 3 for angle, 4 for torsion);
 *   - removeAtomIntrDefs calls `rend.remove(id)` for each id (order-independent,
 *     stable index ids) and reports the removed count;
 *   - missing renderer -> { ok: false }.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
    getSceneOrNull: (ctx: { __scene?: unknown }) => ctx.__scene ?? null,
}))
vi.mock('@renderer/worker/server/services/withUndoTxn', () => ({
    withUndoTxn: (_scene: unknown, _label: string, fn: () => void) => fn(),
}))

import { services } from '@renderer/worker/server/services/atomIntrEdit.service'

const { listAtomIntrDefs, removeAtomIntrDefs } = services

function makeRend(defsJSON: string) {
    const remove = vi.fn((_id: number) => true)
    return { rend: { getDefsJSON: () => defsJSON, remove }, remove }
}

function makeCtx(rend: unknown): WorkerContext {
    const scene = { getRenderer: () => rend }
    return { __scene: scene } as unknown as WorkerContext
}

describe('atomIntrEdit.listAtomIntrDefs', () => {
    it('parses distance / angle / torsion defs into id+mode+atoms', () => {
        const json = JSON.stringify([
            { id: 0, mode: 1, a0: 'A.10.CA', a1: 'A.20.CA' },
            { id: 1, mode: 2, a0: 'a', a1: 'b', a2: 'c' },
            { id: 2, mode: 3, a0: 'a', a1: 'b', a2: 'c', a3: 'd' },
        ])
        const res = listAtomIntrDefs(makeCtx(makeRend(json).rend), { sceneId: 1, rendId: 7 })
        expect(res.ok).toBe(true)
        expect(res.entries).toEqual([
            { id: 0, mode: 1, atoms: ['A.10.CA', 'A.20.CA'] },
            { id: 1, mode: 2, atoms: ['a', 'b', 'c'] },
            { id: 2, mode: 3, atoms: ['a', 'b', 'c', 'd'] },
        ])
    })

    it('returns ok:false when the renderer is missing', () => {
        const res = listAtomIntrDefs(makeCtx(null), { sceneId: 1, rendId: 7 })
        expect(res.ok).toBe(false)
    })
})

describe('atomIntrEdit.removeAtomIntrDefs', () => {
    it('removes each id and reports the count', () => {
        const { rend, remove } = makeRend('[]')
        const res = removeAtomIntrDefs(makeCtx(rend), { sceneId: 1, rendId: 7, ids: [2, 0] })
        expect(res.ok).toBe(true)
        expect(res.removed).toBe(2)
        expect(remove).toHaveBeenCalledWith(2)
        expect(remove).toHaveBeenCalledWith(0)
    })

    it('returns ok:false when the renderer is missing', () => {
        expect(
            removeAtomIntrDefs(makeCtx(null), { sceneId: 1, rendId: 7, ids: [0] }).ok,
        ).toBe(false)
    })
})
