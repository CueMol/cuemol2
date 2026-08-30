/**
 * Pin the Selection Builder backend contracts:
 *
 *   - getSelHitCount -> compiles the string and returns mol.getAtomSelSize.
 *     READ-ONLY: must never open an undo txn (no trace when counting).
 *   - saveSelDef -> stores a named selection under a "Define named selection"
 *     undo txn (scene mutation), picking / creating a writable scene set.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/makeSel', () => ({
    makeSel: vi.fn(() => ({ __sel: true })),
}))

import { services as hitServices } from '@renderer/worker/server/services/getSelHitCount.service'
import { services as saveServices } from '@renderer/worker/server/services/saveSelDef.service'
import { makeSel } from '@renderer/worker/server/services/helpers/makeSel'

const { getSelHitCount } = hitServices
const { saveSelDef } = saveServices

function makeUndoScene(uid: number, getObject?: unknown) {
    return {
        uid,
        startUndoTxn: vi.fn(),
        commitUndoTxn: vi.fn(),
        rollbackUndoTxn: vi.fn(),
        getObject: vi.fn(() => getObject ?? null),
    }
}

function makeCtx(scene: Record<string, unknown> | null, styleMgr?: unknown, sid = 100) {
    return {
        sceMgr: { getScene: vi.fn((id: number) => (id === sid ? scene : null)) },
        styleMgr,
    } as unknown as WorkerContext
}

describe('getSelHitCount', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns the atom count and opens no undo txn', () => {
        const getAtomSelSize = vi.fn(() => 42)
        const mol = { getAtomSelSize }
        const scene = makeUndoScene(100, mol)
        const ctx = makeCtx(scene)
        const result = getSelHitCount(ctx, { sceneId: 100, molId: 11, selStr: 'protein' })
        expect(result).toEqual({ count: 42 })
        expect(makeSel).toHaveBeenCalledWith(ctx, 'protein', 100)
        expect(getAtomSelSize).toHaveBeenCalledWith({ __sel: true })
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })

    it('returns count:null for an empty string without touching the molecule', () => {
        const scene = makeUndoScene(100, { getAtomSelSize: vi.fn() })
        const ctx = makeCtx(scene)
        expect(getSelHitCount(ctx, { sceneId: 100, molId: 11, selStr: '  ' })).toEqual({
            count: null,
        })
        expect(makeSel).not.toHaveBeenCalled()
    })

    it('returns count:null when the string fails to compile', () => {
        ;(makeSel as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
        const scene = makeUndoScene(100, { getAtomSelSize: vi.fn() })
        const ctx = makeCtx(scene)
        expect(getSelHitCount(ctx, { sceneId: 100, molId: 11, selStr: 'bad(' })).toEqual({
            count: null,
        })
    })

    it('returns count:null when the scene lookup misses', () => {
        const ctx = makeCtx(null)
        expect(getSelHitCount(ctx, { sceneId: 100, molId: 11, selStr: 'protein' })).toEqual({
            count: null,
        })
    })
})

describe('saveSelDef', () => {
    beforeEach(() => vi.clearAllMocks())

    it('stores the named selection inside the "Define named selection" undo txn', () => {
        const setStrData = vi.fn(() => true)
        const styleMgr = {
            getStyleSetsJSON: vi.fn(() =>
                JSON.stringify([{ name: 'user', scene_id: 100, uid: 7, readonly: false }]),
            ),
            createStyleSet: vi.fn(),
            setStrData,
        }
        const scene = makeUndoScene(100)
        const ctx = makeCtx(scene, styleMgr)
        const result = saveSelDef(ctx, { sceneId: 100, name: 'mysel', expr: 'chain A' })
        expect(result).toEqual({ ok: true })
        expect(scene.startUndoTxn).toHaveBeenCalledWith('Define named selection')
        expect(scene.commitUndoTxn).toHaveBeenCalledTimes(1)
        expect(setStrData).toHaveBeenCalledWith('sel', 'mysel', 'chain A', 100, 7)
        expect(styleMgr.createStyleSet).not.toHaveBeenCalled()
    })

    it('creates a writable scene set when none exists', () => {
        const setStrData = vi.fn(() => true)
        const styleMgr = {
            getStyleSetsJSON: vi.fn(() =>
                JSON.stringify([{ name: 'builtin', scene_id: 100, uid: 1, readonly: true }]),
            ),
            createStyleSet: vi.fn(() => 9),
            setStrData,
        }
        const scene = makeUndoScene(100)
        const ctx = makeCtx(scene, styleMgr)
        saveSelDef(ctx, { sceneId: 100, name: 'mysel', expr: 'chain A' })
        expect(styleMgr.createStyleSet).toHaveBeenCalledWith('user', 100)
        expect(setStrData).toHaveBeenCalledWith('sel', 'mysel', 'chain A', 100, 9)
    })

    it('rejects empty name or expr', () => {
        const styleMgr = { getStyleSetsJSON: vi.fn(), createStyleSet: vi.fn(), setStrData: vi.fn() }
        const scene = makeUndoScene(100)
        const ctx = makeCtx(scene, styleMgr)
        expect(saveSelDef(ctx, { sceneId: 100, name: '  ', expr: 'chain A' })).toEqual({ ok: false })
        expect(saveSelDef(ctx, { sceneId: 100, name: 'x', expr: '  ' })).toEqual({ ok: false })
        expect(scene.startUndoTxn).not.toHaveBeenCalled()
    })
})
